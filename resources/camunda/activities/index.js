'use strict';

const BoundaryEvent = require('./BoundaryEvent');
const ServiceTask = require('./ServiceTask');
const CallActivity = require('./CallActivity');
const IntermediateEvent = require('./IntermediateEvent');
const ScriptTask = require('./ScriptTask');
const Connector = require('../Connector');
const ServiceExpression = require('../ServiceExpression');
const ServiceProperty = require('../ServiceProperty');

const { SignalTask, MessageEventDefinition } = require('bpmn-elements');

module.exports = function Activity(extensions, activityElement, parentContext) {
  const { logger, behaviour } = activityElement;
  const environment = parentContext.environment || activityElement.environment;
  const {id, $type, eventDefinitions, expression, extensionElements} = behaviour;
  const { form, io, listeners, properties } = extensions;
  const hasExtValues = extensionElements && extensionElements.values;
  let savedState;
  let resumedTag;
  let resultData = {};

  activityElement.throwMessage = function (name) {
    const messageActivity = this.context.getActivities().filter(act => act.name === name)[0];
    if (!messageActivity) throw new Error('Missing message "' + name + '"');
    const msgToThrow = new MessageEventDefinition({
      id: 'throwEvent' + this.executionId.replace(this.id, '')
      , environment: this.environment
      , broker: this.broker
      , isThrowing: true
      , getActivityById(id) {
        if (id !== messageActivity.id) return;
        return messageActivity;
      }
    }
    , {
      behaviour: {
        messageRef: messageActivity.resolve()
      },
    });
    // NO DOT SPECIFY exectionId here, message won't reach destination
    msgToThrow.execute({
      fields: { }
      , content: {
        id: messageActivity.id
        , index: 0
        , parent: this.parent
      }
    });
  }
  activityElement.setOutputValue = function(name, value) {
    if (activityElement.behaviour.io) return activityElement.behaviour.io.setOutputValue(name, value);
    resultData[name] = value;
  }
  activityElement.setResult = function(result1, ...args) {
    if (activityElement.behaviour.io) return activityElement.behaviour.io.setResult(result1, ...args);
    if (args.length) {
      resultData = [result1, ...args];
    } else {
      resultData = result1;
    }
  }
  activityElement.getInput = function() {
    if (activityElement.behaviour.io) return activityElement.behaviour.io.getInput();
  };
  activityElement.getOutput = function(content={}) {
    let output = { ...content.output, ...resultData };
    if (activityElement.behaviour.form) output = Object.assign({}, output, activityElement.behaviour.form.getOutput());
    if (activityElement.behaviour.io) {
      const { io } = activityElement.behaviour;
      Object.keys(output).forEach(key => {
        io.setOutputValue(key, output[key]);
      })
      output = activityElement.behaviour.io.getOutput();
    }
    return output;
  };
  activityElement.getForm = function() {
    if (activityElement.behaviour.form) return activityElement.behaviour.form;
  };

  activityElement.behaviour.__defineGetter__('state', function() {
    const state = {};
    if (this.form && this.form.getState) state.form = this.form.getState();
    if (this.io && this.io.getState) state.io = this.io.getState();
    return state;
  });

  if (!activityElement.behaviour.Service) activityElement.behaviour.Service = extensions.service = loadService();

  if (activityElement.type !== 'bpmn:Process') {
    activityElement._getState = activityElement.getState;
    activityElement.getState = () => {
      return activityElement._getState();
    };
    activityElement._recover = activityElement.recover;
    activityElement.recover = (state) => {
      const response = activityElement._recover(state);
      if (state.behaviour.state) {
        savedState = state.behaviour.state;
        if (state.execution) {
          savedState.execution = state.execution;
        }
      }
      return response;
    }
  }

  switch ($type) {
    case 'bpmn:ServiceTask': return ServiceTask(extensions, activityElement, parentContext);
    case 'bpmn:SendTask': return ServiceTask(extensions, activityElement, parentContext);
    case 'bpmn:ScriptTask': return ScriptTask(extensions, activityElement, parentContext);
    case 'bpmn:BoundaryEvent': return BoundaryEvent(extensions, activityElement, parentContext);
    case 'bpmn:CallActivity': return CallActivity(extensions, activityElement, parentContext);
    case 'bpmn:IntermediateThrowEvent': return IntermediateEvent(extensions, activityElement, parentContext);
    case 'bpmn:IntermediateCatchEvent': return IntermediateEvent(extensions, activityElement, parentContext);
    case 'bpmn:StartEvent': return StartEvent();
    default:
      return Base(extensions);
  }

  function StartEvent() {
    logger.debug('>> StartEvent');
    if (eventDefinitions) {
      const hasMessage = eventDefinitions.find(event => {
        return event.behaviour.$type === 'bpmn:MessageEventDefinition';
      });
      if (hasMessage) return IntermediateEvent(extensions, activityElement, parentContext);
    }
    if (extensions.io || extensions.form) {
      activityElement.Behaviour = SignalTask.SignalTaskBehaviour;
      resumedTag = '_run_resume-' + id;
      activityElement.broker.subscribeTmp('run', 'run.resume', (_eventName, message, api) => {
        logger.debug('>>>> RESUME: %o', message);
      }, { noAck: true, priority: 10000, durable: true, consumerTag: resumedTag });
    }
    return Base();
  }

  function Base() {
    logger.debug(`BASE ${$type} <${id}>`);
//    console.log('hasform? %o', extensions.form);
//    console.warn(activityElement);

    let completedTag;
    let startTag;
    let multiTag;
    let startSPTag;

    activityElement.listeners = listeners;
    return { activate, deactivate };

    function activate(message) {
      if (savedState) message = { ...message, ...savedState };

      if (message.content.isMultiInstance) {
        if (!multiTag) {
          multiTag = `_event-iterate-${message.content.executionId}`;
          activityElement.broker.subscribeTmp('execution'
            , 'execute.start'
            , (event, message) => { console.error('>>> re-activate'); activate(message)}
            , {noAck: true, consumerTag: multiTag, priority: 1000 });
        }
      }
      logger.debug('BASE - activate - message: %o', message);
      if (message.content && message.content.ioSpecification) {
        logger.debug('BASE- iospec: %o', message.content.ioSpecification);
      }
      if (listeners && undefined !== listeners) {
        logger.debug('activate listeners');
        listeners.activate(activityElement, message);
      }
      if (io && io.activate) {
        logger.debug('activate io');
        activityElement.behaviour.io = io.activate(activityElement, message);
        if (savedState && savedState.io) activityElement.behaviour.io.recover(savedState.io);
      }
      if (form && form.activate) {
        logger.debug('activate form');
        activityElement.behaviour.form = form.activate(activityElement, message);
        if (savedState) activityElement.behaviour.form.recover(savedState);
      }
      if (!startTag && $type === 'bpmn:StartEvent') {
        startTag = `_event-start-${parentContext.executionId}`;
        activityElement.broker.subscribeTmp('event'
          , 'activity.start'
          , onActivityStart
          , {noAck: true, consumerTag: startTag });
      }
      if (!completedTag) {
        completedTag = `_event-complete-${id}-${parentContext.executionId}`;
        activityElement.broker.subscribeTmp('event'
          , 'activity.end'
          , onActivityEnd
          , {noAck: true, priotity: 1000 });
        activityElement.broker.subscribeTmp('event'
          , 'activity.execution.completed'
          , onActivityEnd
          , {noAck: true, consumerTag: completedTag });
      }

      if (!startSPTag && $type === 'bpmn:SubProcess') {
        startSPTag = `_event-start-sp-${parentContext.executionId}`;
        /*
        activityElement.broker.subscribeTmp('event', '#', (event, message) => {
          console.error('+++++++++ %o<%o>/%o', event, message.content.id, activityElement.id);
        }, { noAck: true });
        */
        activityElement.broker.subscribeTmp('event'
          , 'activity.start'
          , (event, message) => {
            if (message.content.id!==id)
              return ;
            console.error('>>>>>>>>>>>>>>>>>>> SUBPROCESS-START: %o', message);
            let input = activityElement.getInput();
            console.error('>>> INPUTS? %o', input);
            if (input) {
              message.content.input = input;
              activityElement.environment.assignVariables(input);
            }
          }
          , {noAck: true, priority: 1000, consumerTag: startSPTag });
      }
      return activityElement;
    }
    function onActivityEnd(_eventName, message) {
      let { isMultiInstance, output, id: contentId } = message.content;
      logger.debug(`<${id}> saving outputs (content.id: ${contentId})`);
      if (contentId !== id) return;

      // TODO: remove!!
      if (output) {
        delete output['fields'];
        delete output['content'];
        delete output['properties'];
      }

      if (isMultiInstance) {
        const aggregate = {};
        output.forEach((outputItem) => {
          Object.keys(outputItem).forEach(key => {
            if (!aggregate[key]) aggregate[key] = [];
            aggregate[key].push(outputItem[key]);
          });
        });
        output = aggregate;
      } else {
        const _output = activityElement.getOutput(message.content);
        output = { ...output, ..._output };
      }

      logger.debug(`<${id}> save output: %O`, output);
      if (output===null || Object.entries(output).length===0)
        return ;

      environment.assignVariables(output);
      environment.output[id] = output;
    }

    function onActivityStart(_eventName, message, activity) {
      message.content.input = activity.getInput();
      logger.debug(`<${id}> assigned input: %o`, message.content.input);
      if (!io) return;
      const { broker } = activity;
      const formKeyValue = environment.expressions.resolveExpression(activity.behaviour.getForm().formKey, message);
      logger.debug(`<${id}> apply form ${formKeyValue}`);

      // see commit d5b9087 of bpmn-elements test
      broker.publish('format', 'run.enter.format', {
        form: {
          type: 'camunda:formKey',
          key: formKeyValue,
        }}, { persistent: false }
      );
    }

    function deactivate(message) {
      logger.debug('BASE - deactivate');

      activityElement.broker.cancel(startTag);
      activityElement.broker.cancel(startSPTag);
      activityElement.broker.cancel(completedTag);
      activityElement.broker.cancel(resumedTag);
      activityElement.broker.cancel(multiTag);

      if (listeners && undefined !== listeners) {
        listeners.deactivate(message, activityElement);
      }

      const ioApi = activityElement.behaviour.io;
      if (ioApi && ioApi.setResult) ioApi.setResult(message.content.output);
    }
  }

  function loadService() {
    logger.debug(`<${id}> loadService`);
    if (hasExtValues) {
      const source = extensionElements.values.find((elm) => elm.$type === 'camunda:Connector');
      if (source) {
        logger.debug(`<${id}> loadService: Connector - source: %o`, source);
        return Connector(source, activityElement);
      }
    }

    if (expression) {
      logger.debug(`<${id}> loadService: ServiceExpression`);
      return ServiceExpression(activityElement, parentContext);
    }

    if (properties && properties.getProperty('service')) {
      logger.debug(`<${id}> loadService: ServiceProperty`);
      return ServiceProperty(activityElement
        , parentContext
        , properties);
    }
  }
};
