'use strict';
const Debug = require('debug');
const ResultVariableIo = require('../ResultVariableIo');

module.exports = function ScriptTask(extensions, activityElement, parentContext) {
  const debug = Debug('bpmn-engine:camunda:ScriptTask:' + activityElement.id);
  const {io, listeners } = extensions;
  const {resultVariable} = activityElement.behaviour;

  if (!io && resultVariable) extensions.io = ResultVariableIo(activityElement.behaviour, parentContext);
  if (io && io.allowReturnInputContext) io.allowReturnInputContext(true);

  extensions.activate = function(message) {
    debug('activate');
    if (listeners && undefined !== listeners) listeners.activate(message);
  };
  extensions.deactivate = function(message) {
    debug('deactivate');
    if (listeners && undefined !== listeners) listeners.deactivate(message);
  };
  extensions.resume = (...args) => {
    debug('----- RESUME! %o', args);
  };

  extensions.execute = (...args) => {
    debug('*********************** EXECUTE: %o', args);
  };

  extensions.getOutput = (...args) => {
    debug('*********************** EXECUTE: %o', args);
  };
  return extensions;
};
