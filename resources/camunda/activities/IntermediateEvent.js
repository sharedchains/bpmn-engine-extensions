'use strict';

const Connector = require('../Connector');
const ResultVariableIo = require('../ResultVariableIo');
const ServiceExpression = require('../ServiceExpression');
const ServiceProperty = require('../ServiceProperty');
const Fields = require('../Fields');

module.exports = function IntermediateEvent(extensions, activityElement, parentContext) {
  const isThrow = activityElement.isThrowing;
  const debug = activityElement.environment.Logger('bpmn-engine:camunda:Intermediate' + (isThrow ? 'Throw' : 'Catch' ) + 'Event:' + activityElement.id).debug;
  const {io, properties, listeners } = extensions;
  const {resultVariable, eventDefinitions} = activityElement.behaviour;
  let connectorExecutor = null;
  let messageTag;
  debug('eventType: %o', (isThrow ? 'THROW' : 'CATCH'));

  if (!io && resultVariable) {
    extensions.io = ResultVariableIo(activityElement, parentContext);
  } if (io && io.allowReturnInputContext) {
    io.allowReturnInputContext(true);
  }

  extensions.listeners = listeners;
  extensions.service = loadService(eventDefinitions);
  activityElement.behaviour.Service = executeConnector;
  extensions.activate = (message) => {
    debug('>>> activate %o', message);
    if (listeners && undefined !== listeners) {
      listeners.activate(activityElement, message);
    }
    if (extensions.service) {
      debug('activate Connector/Service');
      console.error(eventDefinitions);
      connectorExecutor = new extensions.service(activityElement,
        Object.assign({}, message
          , { isLoopContext: message.isMultiInstance, index: 0 })
      );
      messageTag = `_event-message-${message.content.executionId}`;
      activityElement.broker.subscribeTmp('event', 'activity.message'
        , (eventName, context) => {
          console.error('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> ACTIVITY.MESSAGE');
          console.error(activityElement);
          connectorExecutor.execute(context, (err, cb) => {
            console.error('ACTIVITY.MESSAGE done CTX: %o', context);
          })
          console.error('<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<< ACTIVITY.MESSAGE');
        }
        , { noAck: true, priority: 1000, consumerTag: messageTag});
    };
  }


  extensions.deactivate = (message) => {
    debug('deactivate %o', message);
    if (listeners && undefined !== listeners) {
      listeners.deactivate(message, activityElement);
    }
    activityElement.broker.cancel(messageTag);
  };

  return extensions;

  function getFields() {
    const eventDefinition = activityElement.behaviour.eventDefinitions.find(def => def.type === 'bpmn:MessageEventDefinition');
    const { extensionElements } = eventDefinition.behaviour;
    if (!extensionElements || !extensionElements.values) return;

    return Fields(extensionElements.values, activityElement.environment).get();
  }

  function loadService(evntDefinitions) {
    const hasExtValues = evntDefinitions && evntDefinitions.length > 0;
    debug('loadService: extValues: %o', hasExtValues);
    debug('loadService: evntDefinition: %o', evntDefinitions);
    if (!hasExtValues) {
      debug('>> NO ExtValues');
      return null;
    }

    debug('>> has ExtValues');
    // per ora consideriamo un solo messaggio
    const event = evntDefinitions[0].behaviour;
    debug('event: %o', event);
    if (event.extensionElements && event.extensionElements.values) {
      const extensionElements = event.extensionElements.values;
      const source = extensionElements.find((elm) => elm.$type === 'camunda:Connector');
      debug('has connector - source: %o', source);
      if (source) {
        return Connector(source, activityElement, parentContext);
      }
    }

    debug('loadService: expression: %o', activityElement.expression);
    debug('loadService: properties: %o', properties);
    if (activityElement.expression) {
      return ServiceExpression(activityElement, parentContext);
    } else if (properties && properties.getProperty('service')) {
      return ServiceProperty(activityElement
        , parentContext
        , properties);
    }

  }

  function executeConnector(...args) {
    debug('executing connector: %o', args);
    debug('has connector? %o', (connectorExecutor ? connectorExecutor : 'nada'));
    if (connectorExecutor) return connectorExecutor;
  }

};
