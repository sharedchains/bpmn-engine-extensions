'use strict';

const Connector = require('../Connector');
const ResultVariableIo = require('../ResultVariableIo');
const ServiceExpression = require('../ServiceExpression');
const ServiceProperty = require('../ServiceProperty');

module.exports = function ServiceTask(extensions, activityElement, parentContext) {
  const { properties, listeners } = extensions;
  let { io } = extensions;
  const { id, logger } = activityElement;
  const {extensionElements, resultVariable, expression } = activityElement.behaviour;
  logger.debug(`<${id}> init`);

  const _loopCharacteristics = activityElement.behaviour.loopCharacteristics;
  const loopCharacteristics = _loopCharacteristics
    && _loopCharacteristics.Behaviour(activityElement
      , _loopCharacteristics);

  const hasExtValues = extensionElements && extensionElements.values;
  let completeTag;
  let startTag;

  if (!io && resultVariable) io = extensions.io = ResultVariableIo(activityElement.behaviour, parentContext);
  if (io && io.allowReturnInputContext) io.allowReturnInputContext(true);

  extensions.listeners = listeners;
  if (!activityElement.behaviour.Service) activityElement.behaviour.Service = extensions.service = loadService();
  extensions.loopCharacteristics = loopCharacteristics;

  activityElement.behaviour.io = io;
  activityElement.behaviour.listeners = listeners;
  extensions.activate = (inputContext) => {
    logger.debug(`<${id}> activate: has io ${io ? 'Y' : 'N'} `);
    if (io && io.activate) {
      if (inputContext.content.isMultiInstance) {
        if (!startTag) {
          startTag = `_event-start-${id}-${parentContext.executionId}`;
          activityElement.broker.subscribeTmp('execution'
            , 'execute.start'
            , (eventName, message) => {
              logger.debug(`<${id}> iteration ${message.content.index} activate`);
              activityElement.behaviour.io = io.activate(activityElement, message);
            }
            , {noAck: true, priority: 1000, consumerTag: startTag });
        }
      } else {
        logger.debug('activate io');
        activityElement.behaviour.io = io.activate(activityElement, inputContext);
        if (!completeTag) {
          completeTag = `_event-complete-${id}-${parentContext.executionId}`;
          activityElement.broker.subscribeTmp('event'
            , 'activity.execution.completed'
            , onActivityEnd
            , {noAck: true, consumerTag: completeTag });
        }
        if (!startTag) {
          startTag = `_event-start-${id}-${parentContext.executionId}`;
          activityElement.broker.subscribeTmp('run'
            , 'run.execute'
            , onActivityStart
            , {noAck: true, consumerTag: startTag, priority: 1000 });
        }
      }
    }

    if (listeners && undefined !== listeners) {
      logger.debug('activate listeners');
      listeners.activate(activityElement, inputContext);
    }

    if (activityElement.behaviour.Service
      && (activityElement.behaviour.Service.activate
        || Object.prototype.hasOwnProperty.call(activityElement.behaviour.Service, 'activate'))) {
      logger.debug('activate - service: %o', activityElement.behaviour.Service);
      activityElement.behaviour.Service.activate(activityElement, inputContext);
    }

    function onActivityStart(_eventName, message, activity) {
      message.content.input = activity.getInput();
      logger.debug(`<${id}> apply input on ${_eventName}`);
      console.error('>> assigned input: %o', message.content.input);
    }

    function onActivityEnd(_eventName, message, {behaviour, environment}) {
      logger.debug(`<${id}> saving outputs`);
      let { isMultiInstance, output } = message.content;
      console.log('>>>>>>>>>>>>>>>>>>>>> ON-ACTIVITY-END: output: %o', output);
      if (isMultiInstance) {
        const aggregate = {};
        output.forEach((outputItem) => {
          Object.keys(outputItem).forEach(key => {
            if (!aggregate[key]) aggregate[key] = [];
            aggregate[key].push(outputItem[key]);
          });
        });
        output = aggregate;
      }
      behaviour.io.setResult(output);
      behaviour.io.save();
      environment.output[id] = behaviour.io.getOutput();
    }
  };

  extensions.deactivate = (inputContext) => {
    activityElement.broker.cancel(completeTag);
    activityElement.broker.cancel(startTag);
    completeTag = null;
    startTag = null;

    if (listeners && undefined !== listeners) listeners.deactivate(activityElement, inputContext);

    const ioApi = activityElement.behaviour.io;
    if (ioApi && ioApi.setResult) ioApi.setResult(inputContext.content.output);
  };

  extensions.getState = () => {
    logger.debug('-Activity-GETSTATE');
    return this.listeners;
  };

  return extensions;

  function loadService() {
    if (hasExtValues) {
      const source = extensionElements.values.find((elm) => elm.$type === 'camunda:Connector');
      if (source) {
        logger.debug('loadService: Connector - source: %o', source);
        return Connector(source, activityElement);
      }
    }

    if (expression) {
      logger.debug('loadService: ServiceExpression');
      return ServiceExpression; //(activityElement, parentContext);
    }

    if (properties && properties.getProperty('service')) {
      logger.debug('loadService: ServiceProperty');
      return ServiceProperty(activityElement
        , parentContext
        , properties);
    }
  }
};
