'use strict';
const Debug = require('debug');

module.exports = function ScriptTask(extensions, activityElement) {
  const debug = Debug('bpmn-engine:camunda:ScriptTask:' + activityElement.id);
  const {io, listeners } = extensions;

  if (io && io.allowReturnInputContext) {
    io.allowReturnInputContext(true);
  }

  extensions.activate = function(message)
  {
    if (listeners && undefined !== listeners)
    {
      listeners.activate(message);
    }
  };
  extensions.deactivate = function(message) {
    debug('deactivate');
    if (listeners && undefined !== listeners)
    {
      listeners.deactivate(message);
    }
  };
  return extensions;
};
