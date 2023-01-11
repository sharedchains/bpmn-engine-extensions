'use strict';
const ResultVariableIo = require('../ResultVariableIo');

module.exports = function ScriptTask(extensions, activityElement, parentContext) {
  const {io, listeners } = extensions;
  const {resultVariable} = activityElement.behaviour;
  const { id, logger } = activityElement;
  let completeTag;

  if (!io && resultVariable) extensions.io = ResultVariableIo(activityElement.behaviour, parentContext);
  if (io && io.allowReturnInputContext) io.allowReturnInputContext(true);

  activityElement.behaviour.io = io;
  extensions.$type = activityElement.type;
  extensions.activate = function(message) {
    if (listeners && undefined !== listeners) listeners.activate(activityElement, message);
    if (io && io.activate) activityElement.behaviour.io = io.activate(activityElement, message);
    completeTag = `_event-complete-${id}-${parentContext.executionId}`;
    activityElement.broker.subscribeTmp('event'
      , 'activity.execution.completed'
      , onActivityEnd
      , {noAck: true, consumerTag: completeTag });
  };
  extensions.deactivate = function(message) {
    if (listeners && undefined !== listeners) listeners.deactivate(activityElement, message);
    if (io && io.deactivate) io.deactivate(activityElement, message);
    activityElement.broker.cancel(completeTag);
  };
  function onActivityEnd(_eventName, message, {behaviour, environment}) {
    logger.debug(`<${id}> saving outputs`);
    let { isMultiInstance, output } = message.content;
//    console.log('>>>>>>>>>>>>>>>>>>>>> ON-ACTIVITY-END: output: %o', output);
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
  return extensions;
};
