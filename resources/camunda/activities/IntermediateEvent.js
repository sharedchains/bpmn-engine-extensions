'use strict';

const Debug = require('debug');
const Connector = require('../Connector');
const ResultVariableIo = require('../ResultVariableIo');
const ServiceExpression = require('../ServiceExpression');
const ServiceProperty = require('../ServiceProperty');

module.exports = function IntermediateEvent(extensions, activityElement, parentContext) {
  const isThrow = activityElement.isThrowing;
  const debug = Debug('bpmn-engine:camunda:Intermediate' + (isThrow ? 'Throw' : 'Catch' ) + 'Event:' + activityElement.id);
  debug('enter : %o', activityElement);
  const {io, properties, listeners } = extensions;
  const {resultVariable} = activityElement.behaviour;
  let connectorExecutor = null;
  debug('eventType: %o', (isThrow ? 'THROW' : 'CATCH'));
  debug('io: %o', io);
  debug('activityElement: %o', activityElement);
  debug('extensions: %o', extensions);

  if (!io && resultVariable) {
    extensions.io = ResultVariableIo(activityElement, parentContext);
  } if (io && io.allowReturnInputContext) {
    io.allowReturnInputContext(true);
  }

  extensions.listeners = listeners;
  extensions.service = loadService(activityElement.behaviour.eventDefinitions);
  activityElement.behaviour.Service = executeConnector;
  extensions.activate = (message) => {
    debug('>>> activate %o', message);
    debug('>>> activate-activity: %o', activityElement);
    debug('>>> parent-context: %o', parentContext);
    debug('>>> hasConnector: %o', parentContext);
    if (listeners && undefined !== listeners) {
      listeners.activate(message, activityElement);
    }
    if (extensions.service && extensions.service.activate) {
      connectorExecutor = extensions.service.activate(message
        , { isLoopContext: message.isMultiInstance, index: 0 });
    }
  };

  extensions.deactivate = (message) => {
    debug('deactivate %o', message);
    if (listeners && undefined !== listeners) {
      listeners.deactivate(message, activityElement);
    }
  };

  debug('(init) returned : %o', extensions);
  return extensions;

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
