'use strict';
const ResultVariableIo = require('../ResultVariableIo');

module.exports = function ScriptTask(extensions, activityElement, parentContext) {
  const {io, listeners } = extensions;
  const {resultVariable} = activityElement.behaviour;

  if (!io && resultVariable) extensions.io = ResultVariableIo(activityElement.behaviour, parentContext);
  if (io && io.allowReturnInputContext) io.allowReturnInputContext(true);

  extensions.$type = activityElement.type;
  extensions.activate = function(message) {
    if (listeners && undefined !== listeners) listeners.activate(activityElement, message);
    if (io && io.activate) io.activate(activityElement, message);
  };
  extensions.deactivate = function(message) {
    if (listeners && undefined !== listeners) listeners.deactivate(activityElement, message);
    if (io && io.deactivate) io.deactivate(activityElement, message);
  };
  return extensions;
};
