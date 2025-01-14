'use strict';

const Listener = require('./Listener');

module.exports = function Listeners(listeners, parentContext) {
  const type = 'camunda:ExecutionListeners';
  const { debug } = parentContext.environment.Logger(`bpmn-engine:${type.toLowerCase()}`);
  const atEventList = [];

  debug('listeners: %o', listeners);

  for (const idx in listeners) {
    const elm = listeners[idx];
    atEventList.push(Listener(elm, parentContext));
  }

  return {
    type,
    activate,
    deactivate,
    getAll,
    getAt,
    atEnd,
    atStart
  };

  function activate(parentApi, executionContext) {
    debug('>>> <%o>listeners.activate %o', parentApi.id, (executionContext.fields ? executionContext.fields.routingKey : {}));
    if (!(executionContext && executionContext.fields && executionContext.fields.routingKey === 'run.enter')) return;

    for (const idx in atEventList) {
      atEventList[idx].activate(parentApi, executionContext);
    }

    debug('activated!');
  }

  function deactivate(parentApi, executionContext) {
    if (!(executionContext && executionContext.fields && executionContext.fields.routingKey === 'run.leave')) return;

    for (const idx in atEventList) {
      atEventList[idx].deactivate(parentApi, executionContext);
    }
    debug('deactivated');
  }

  function getAll() {
    return atEventList;
  }

  function getAt(when) {
    return atEventList.filter(listener => listener.event === when);
  }
  function atEnd() {
    return getAt('end');
  }

  function atStart() {
    return getAt('start');
  }
};
