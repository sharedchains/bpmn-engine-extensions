'use strict';

const Debug = require('debug');
const Connector = require('../Connector');
const ResultVariableIo = require('../ResultVariableIo');
const ServiceExpression = require('../ServiceExpression');
const ServiceProperty = require('../ServiceProperty');

module.exports = function ServiceTask(extensions, activityElement, parentContext) {
  const debug = Debug('bpmn-engine:camunda:ServiceTask:' + activityElement.id);
  debug('enter : %o', extensions);
  const { properties, listeners } = extensions;
  let { io } = extensions;
  const {extensionElements, resultVariable, expression } = activityElement.behaviour;
  const serviceImplementation = activityElement.behaviour.Service;

  const _loopCharacteristics = activityElement.behaviour.loopCharacteristics;
  const loopCharacteristics = _loopCharacteristics
    && _loopCharacteristics.Behaviour(activityElement
      , _loopCharacteristics);

  const hasExtValues = extensionElements && extensionElements.values;
  let connectorExecutor = null;
  debug('extensions: %o', extensionElements);
  debug('io: %o', io);

  if (!io && resultVariable) io = extensions.io = ResultVariableIo(activityElement.behaviour, parentContext);
  if (io && io.allowReturnInputContext) io.allowReturnInputContext(true);

  extensions.listeners = listeners;
  extensions.service = loadService();
  extensions.loopCharacteristics = loopCharacteristics;

  activityElement.behaviour.Service = (activity, executionMessage) => {
    if (serviceImplementation) return serviceImplementation(activity, executionMessage);
    if (connectorExecutor) return connectorExecutor;
    const service = parentContext.environment.getServiceByName(activityElement.id);
    if (service) {
      if (service.execute) return service;
      return {
        execute: (...args) => {
          service(args);
        }
      };
    }
  };

  activityElement.behaviour.listeners = listeners;

  extensions.activate = (inputContext) => {
    debug('activate - element: %o', activityElement.id);
    if (io && io.activate) {
      debug('activate io');
      activityElement.behaviour.io = io.activate(activityElement, inputContext);
    }

    if (!inputContext.content.message) inputContext.content.message = {};
    inputContext.content.message.variables = Object.assign({},
      inputContext.content.message.variables,
      activityElement.behaviour.io ? activityElement.behaviour.io.getInput() : null
    );
    if (listeners && undefined !== listeners) {
      debug('activate listeners');
      listeners.activate(activityElement, inputContext);
    }

    if (extensions.service && extensions.service.activate) {
      debug('activate - service: %o', extensions.service);
      connectorExecutor = extensions.service.activate(activityElement
        , Object.assign({}, inputContext, { isLoopContext: inputContext.isMultiInstance, index: 0 }));
    }
  };

  extensions.deactivate = (inputContext) => {
    debug('deactivate message: %o - listeners? %o', inputContext, listeners);
    if (listeners && undefined !== listeners) listeners.deactivate(activityElement, inputContext);

    const ioApi = activityElement.behaviour.io;
    if (ioApi && ioApi.setResult) ioApi.setResult(inputContext.content.output);
  };

  extensions.getState = () => {
    debug('-Activity-GETSTATE');
    return this.listeners;
  };

  extensions.recover = (...args) => {
    debug('-Activity-RESUME: %o', args);
  };

  debug('(init) returned : %o', extensions);
  return extensions;

  function loadService() {
    debug('loadService: extValues: %o', hasExtValues);
    if (hasExtValues) {
      const source = extensionElements.values.find((elm) => elm.$type === 'camunda:Connector');
      if (source) return Connector(source, activityElement, parentContext);
    }

    debug('loadService: expression: %o', expression);
    debug('loadService: properties: %o', properties);
    if (expression) return ServiceExpression(activityElement, parentContext);

    if (properties && properties.getProperty('service')) {
      return ServiceProperty(activityElement
        , parentContext
        , properties);
    }
  }
};
