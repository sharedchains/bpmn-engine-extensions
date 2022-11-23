'use strict';

const BoundaryEvent = require('./BoundaryEvent');
const SignalTask = require('bpmn-elements/dist/src/tasks/SignalTask');
const ServiceTask = require('./ServiceTask');
const CallActivity = require('./CallActivity');
const IntermediateEvent = require('./IntermediateEvent');
const ScriptTask = require('./ScriptTask');

module.exports = function Activity(extensions, activityElement, parentContext) {
  const { logger, behaviour, environment } = activityElement;
  const {id, $type, eventDefinitions} = activityElement.behaviour;
  const { form, io, listeners } = extensions;
  let savedState;
  let resumedTag;
  let resultData = {};

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
    if (this.form) state.form = this.form.getState();
    if (this.io) state.io = this.io.getState();
    return state;
  });

  if (activityElement.type !== 'bpmn:Process') {
    activityElement._getState = activityElement.getState;
    activityElement.getState = () => {
      const state = activityElement._getState();
      console.error('%o -> STATE: %o', activityElement.id, state);
      return state;
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
    console.error('>> StartEvent');
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
        console.error('>>>> RESUME: %o', message);
        console.error(savedState);
      }, { noAck: true, priority: 10000, durable: true, consumerTag: resumedTag });
    }
    return Base();
  }

  function Base() {
    console.log(`BASE ${$type} <${id}>`);
    console.log('hasform? %o', extensions.form);

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
          console.error('>> subscribe');
          multiTag = `_event-iterate-${message.content.executionId}`;
          activityElement.broker.subscribeTmp('execution'
            , 'execute.start'
            , (event, message) => { console.error('>>> re-activate'); activate(message)}
            , {noAck: true, consumerTag: multiTag, priority: 1000 });
        }
      }
      logger.debug('BASE - activate - message: %o', message);
//      console.error(message.content);
//      console.error(environment.variables);
      logger.debug('BASE - activate - behaviour: %o', behaviour);
      if (message.content && message.content.ioSpecification) {
        console.log('BASE- iospec: %o', message.content.ioSpecification);
      }
      if (listeners && undefined !== listeners) {
        listeners.activate(message, activityElement);
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
        console.error('>>> subscribe!');
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

      logger.debug(`<${id}> saving outputs`);
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
        console.error('>>> getoutput: %o', output);
      }

      if (output===null || Object.entries(output).length===0)
        return ;
      environment.assignVariables(output);
      environment.output[id] = output;
    }

    function onActivityStart(_eventName, message, activity) {
      message.content.input = activity.getInput();
      console.error('>> assigned input: %o', message.content.input);
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
};
