'use strict';

const Debug = require('debug');
const BoundaryEvent = require('./BoundaryEvent');
const FormIo = require('../FormIo');
const ServiceTask = require('./ServiceTask');

module.exports = function Activity(extensions, activityElement, parentContext) {
  const {id, $type} = activityElement.behaviour;
  const {form, io, properties, listeners} = extensions;
  const debug = Debug(`bpmn-engine:camunda:Activity:${id}`);

  debug(' elemType:%o actElem:%o <<', $type, activityElement);
  debug(' extensions:%o', extensions);
  let retData = null;
  if ($type === 'bpmn:ServiceTask') retData = ServiceTask({io, properties, listeners}, activityElement, parentContext);
  else if ($type === 'bpmn:ScriptTask') retData = ServiceTask({io, properties, listeners}, activityElement, parentContext);
  else if ($type === 'bpmn:BoundaryEvent') retData = BoundaryEvent({io, properties, listeners}, activityElement, parentContext);
  else retData = Base();
  debug(' ret:%o <<', retData);
  return retData;

  function activate(message) {
    debug('activate');
    if (listeners && undefined !== listeners)
    {
      listeners.activate(message);
    }
  }
  function deactivate(message) {
    debug('deactivate');
    if (listeners && undefined !== listeners)
    {
      listeners.deactivate(message);
    }
  }
  function Base() {
    debug('>base');
    let loadedIo = io;
    if (!loadedIo && form) {
      loadedIo = FormIo(form, parentContext);
    }
    return {
      io: loadedIo,
      properties,
      listeners,
      activate,
      deactivate,
      id, $type
    };
  }
};
