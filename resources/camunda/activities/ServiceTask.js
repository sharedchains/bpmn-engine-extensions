'use strict';

const Debug = require('debug');
const Connector = require('../Connector');
const ResultVariableIo = require('../ResultVariableIo');
const ServiceExpression = require('../ServiceExpression');
const ServiceProperty = require('../ServiceProperty');

module.exports = function ServiceTask(extensions, activityElement, parentContext) {
  const debug = Debug('bpmn-engine:camunda:ServiceTask:' + activityElement.id);
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

  if (!io && resultVariable) io = extensions.io = ResultVariableIo(activityElement.behaviour, parentContext);
  if (io && io.allowReturnInputContext) io.allowReturnInputContext(true);

  extensions.listeners = listeners;
  activityElement.behaviour.Service = extensions.service = loadService();
  extensions.loopCharacteristics = loopCharacteristics;

  activityElement.behaviour._Service = (activity, executionMessage) => {
    const service = parentContext.environment.getServiceByName(activityElement.id);
    debug(`Service: calling ${serviceImplementation ? 'serviceImplementation' : ''}${connectorExecutor ? 'connectorExecutor' : ''}${service ? 'service' : ''}`);
    debug('Service: execution: %o', executionMessage);
    if (executionMessage.content.isMultiInstance && io && io.activate) {
      const ioApi = io.activate(activity, executionMessage);
      const inputs = ioApi.getInput();
      debug('Service loopContext-inputs: %o', inputs);
      executionMessage.variables = Object.assign({}, executionMessage.variables
        , inputs);
      connectorExecutor.setInputContext(executionMessage);
    }
    if (serviceImplementation) return serviceImplementation(activity, executionMessage);
    if (connectorExecutor) return connectorExecutor;
    if (service) {
      if (service.execute) return service;
      const _service = (_activity) => {
        this.type = 'thisservice';
        this.activity = _activity;
      };
      _service.prototype.execute = (...args) => {
        return service(args);
      };
      return _service;
    }
  };
  activityElement.behaviour.io = io;
  activityElement.behaviour.listeners = listeners;

  extensions.activate = (inputContext) => {
    debug('activate - element: %o', activityElement.id);
    const _inputContext = Object.assign({}, inputContext
      , {content: { isLoopContext: inputContext.content.isMultiInstance, index: 0 }});
    if (io && io.activate) {
      debug('activate io');
      activityElement.behaviour.io = io.activate(activityElement, _inputContext);
    }

    if (!_inputContext.content.message) _inputContext.content.message = {};
    _inputContext.content.message.variables = Object.assign({},
      _inputContext.content.message.variables,
      activityElement.behaviour.io ? activityElement.behaviour.io.getInput() : null
    );
    if (listeners && undefined !== listeners) {
      debug('activate listeners');
      listeners.activate(activityElement, _inputContext);
    }

    if (extensions.service && extensions.service.activate) {
      debug('activate - service: %o', extensions.service);
      connectorExecutor = extensions.service.activate(activityElement, _inputContext);
    }
  };

  extensions.deactivate = (inputContext) => {
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

  return extensions;

  function loadService() {
    if (hasExtValues) {
      const source = extensionElements.values.find((elm) => elm.$type === 'camunda:Connector');
      if (source) {
        debug('loadService: Connector');
        return Connector(source, activityElement, parentContext);
      }
    }

    if (expression) {
      debug('loadService: ServiceExpression');
      return ServiceExpression; //(activityElement, parentContext);
    }

    if (properties && properties.getProperty('service')) {
      debug('loadService: ServiceProperty');
      return ServiceProperty(activityElement
        , parentContext
        , properties);
    }
  }
};
