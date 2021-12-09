'use strict';

const Debug = require('debug');
const Listener = require('./Listener');

module.exports = function Listeners(listeners, parentContext)
{
  const type = 'camunda:ExecutionListeners';
  const debug = Debug(`bpmn-engine:${type.toLowerCase()}`);
  const atEventList = [];

  debug('listeners: %o', listeners);

  for (const idx in listeners)
  {
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

  function activate(parentApi, activityElement)
  {
    debug('activate: key: ' + parentApi.fields.routingKey);
    if (parentApi.fields.routingKey !== 'run.enter')
    {
      return ;
    }

    for (const idx in atEventList)
    {
      atEventList[idx].activate(parentApi, activityElement);
    }

	  debug('>> activated!');
  }

  function deactivate(parentApi, activityElement) {
	  debug('<< deactivate: %o', parentApi.fields.routingKey);
    if (parentApi.fields.routingKey !== 'run.leave')
      return;

    for (const idx in atEventList)
    {
      atEventList[idx].deactivate(parentApi, activityElement);
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