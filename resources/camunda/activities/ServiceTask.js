'use strict';

const Debug = require('debug');
const Connector = require('../Connector');
const ResultVariableIo = require('../ResultVariableIo');
const ServiceExpression = require('../ServiceExpression');
const ServiceProperty = require('../ServiceProperty');

module.exports = function ServiceTask(extensions, activityElement, parentContext) {
  const debug = Debug('bpmn-engine:camundaServiceTask:'+activityElement.id);
  const {io, properties, listeners } = extensions;
  const {extensionElements, resultVariable} = activityElement.behaviour;
  const loopCharacteristics = activityElement.behaviour.loopCharacteristics
    && activityElement.behaviour.loopCharacteristics.Behaviour(activityElement
        , activityElement.behaviour.loopCharacteristics);
  const hasExtValues = extensionElements && extensionElements.values;
  let connectorExecutor = null;
  debug('extensions: %o', extensionElements);
  debug('io: %o', io);

  if (!io && resultVariable) {
    extensions.io = ResultVariableIo(activityElement, parentContext);
  } if (io && io.allowReturnInputContext) {
    io.allowReturnInputContext(true);
  }

  extensions.service = loadService();
  extensions.loopCharacteristics = loopCharacteristics;
  activityElement.behaviour.Service = executeConnector;
  extensions.activate = (message) => {
    debug(`activate ${message}`, message);
    if (listeners && undefined!==listeners)
        listeners.activate(message);
    if (extensions.service && extensions.service.activate)
      connectorExecutor = extensions.service.activate(message
        , { isLoopContext: false, index: 0 });
  }

  extensions.deactivate = (message) => {
    debug(`deactivate ${message}`);
    if (listeners && undefined!==listeners)
        listeners.deactivate(message);
  }

  return extensions;

  function loadService() {
    if (hasExtValues) {
      const source = extensionElements.values.find((elm) => elm.$type === 'camunda:Connector');
      if (source) { return Connector(source, activityElement, parentContext); }
    }

    if (activityElement.expression) {
      return ServiceExpression(activityElement, parentContext);
    } else if (properties && properties.getProperty('service')) {
      return ServiceProperty(activityElement
        , parentContext
        , properties.getProperty('service'));
    }
  }
  
  function executeConnector(...args) {
      debug(`executing service: %o`, args);
      debug(`has connector? %o`, (connectorExecutor ? connectorExecutor : "nada"));
      if (connectorExecutor)
        return connectorExecutor;
  }
};
