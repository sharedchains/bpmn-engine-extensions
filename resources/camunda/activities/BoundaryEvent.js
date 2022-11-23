'use strict';

const Debug = require('debug');

module.exports = function BoundaryEvent(extensions, activityElement, parentContext) {
  const {id} = activityElement;
  const { eventDefinitions } = activityElement.behaviour;
  const {listeners} = extensions;
  let catchTag;
  let timeoutTag;
  const debug = Debug(`bpmn-engine:camunda:${activityElement.type}:${activityElement.id}`);
  /*
  console.log('>>>>>>>>>>>>> BOUNDARY-EVENT: %o', activityElement.id);
          activityElement.broker.subscribeTmp('event', '#', (...args) => {
            console.error('(BoundaryEvent) + EVENT: [%o]%o', id, args[0]);
            if (args[0]==='activity.timeout') console.error(args[1]);
          }, {noAck: true });
          activityElement.broker.subscribeTmp('run', '#', (...args) => {
            console.error('(BoundaryEvent) + RUN: [%o]%o', id, args[0]);
          }, {noAck: true });
    const x = activityElement.broker.subscribeTmp('event', 'activity.start', (...args) => {
      console.error('(BoundaryEvent) + EVENT: [%o]%o', id, args[0]);
      console.error('>> MESSAGE: %o', args[1]);
      console.error('++++++++++++++++++++++++++++++++++++++++++++++++++++++++++');

    }, {noAck: true });
    */

  extensions.activate = (context) => {
    debug('activate: message: %o', context);
    debug('activate: listners: %o', listeners);
    if (listeners) {
      listeners.activate(context, activityElement);
    }
    if (!timeoutTag) {
      timeoutTag = `_event-timeout-${id}-${context.content.executionId}`;
      activityElement.broker.subscribeTmp('event', 'activity.timeout', (_eventName, message, api) => {
        console.error('(BoundaryEvent) + EVENT: [%o]%o', id, _eventName);
        console.error('(BoundaryEvent) + MESSAGE: [%o]%o', id, message.content);
        const { expireAt, timeout, startedAt, stoppedAt, runningTime } = message.content;
        const result = { expireAt, timeout, startedAt, stoppedAt, runningTime };
        api.context.environment.output[id] = result;
        api.context.environment.assignVariables({
          [id]: result
        });
      }, {consumerTag: timeoutTag });
    }
    if (!catchTag) {
      catchTag = `_event-catch-${id}-${context.content.executionId}`;
      activityElement.broker.subscribeTmp('event', 'activity.catch', (_eventName, message, api) => {
        console.error('(BoundaryEvent) + EVENT: [%o]%o', id, _eventName);
        console.error('(BoundaryEvent) + MESSAGE: [%o]%o', id, message.content);
        const errorDefs = eventDefinitions.filter(def => def.behaviour.$type === 'bpmn:ErrorEventDefinition');
        console.error(errorDefs);
        if (errorDefs) {
          const { errorCodeVariable, errorMessageVariable } = errorDefs[0].behaviour;
          const { code: errCode, description: errMessage } = message.content.error;
          const output = {};
          if (errorCodeVariable) output[errorCodeVariable] = errCode;
          if (errorMessageVariable) output[errorMessageVariable] = errMessage;
          api.context.environment.output[id] = output;
          api.context.environment.assignVariables(output);
        }
      }, { consumerTag: catchTag });
    }
  };
  extensions.deactivate = (message) => {
    debug('activate');

    if (catchTag) activityElement.broker.cancel(catchTag);
    if (timeoutTag) activityElement.broker.cancel(timeoutTag);

    if (listeners) {
      listeners.deactivate(message, activityElement);
    }
  };

  return extensions;

};
