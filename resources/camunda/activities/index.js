'use strict';

const Debug = require('debug');
const BoundaryEvent = require('./BoundaryEvent');
const FormIo = require('../FormIo');
const ServiceTask = require('./ServiceTask');
const CallActivity = require('./CallActivity');
const IntermediateEvent = require('./IntermediateEvent');
const ScriptTask = require('./ScriptTask');

module.exports = function Activity(extensions, activityElement, parentContext) {
  const {id, $type, eventDefinitions} = activityElement.behaviour;
  const {form, io, properties, listeners} = extensions;
  const activityExtensions = { io, properties, listeners};
  const debug = Debug(`bpmn-engine:camunda:Activity:${$type}:${id}`);

  debug(' elemType:%o actElem:%o <<', $type, activityElement);
  debug(' extensions:%o', extensions);
  switch ($type) {
    case 'bpmn:ServiceTask': return ServiceTask(activityExtensions, activityElement, parentContext);
    case 'bpmn:ScriptTask': return ScriptTask(activityExtensions, activityElement, parentContext);
    case 'bpmn:BoundaryEvent': return BoundaryEvent(activityExtensions, activityElement, parentContext);
    case 'bpmn:CallActivity': return CallActivity(activityExtensions, activityElement, parentContext);
    case 'bpmn:IntermediateThrowEvent': return IntermediateEvent(activityExtensions, activityElement, parentContext);
    case 'bpmn:IntermediateCatchEvent': return IntermediateEvent(activityExtensions, activityElement, parentContext);
    case 'bpmn:StartEvent': return StartEvent();
  }
  return Base();

  function StartEvent() {
    if (eventDefinitions) {
      const hasMessage = eventDefinitions.find(event => {
        return event.behaviour.$type === 'bpmn:MessageEventDefinition';
      });
      if (hasMessage) return IntermediateEvent(activityExtensions, activityElement, parentContext);
    }
    return Base();
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
      execute,
      resume,
      id, $type
    };

    function resume(...args) {
      debug('------- resume: %o', args);
    }
    function activate(message) {
      debug('activate');
      if (listeners && undefined !== listeners) {
        listeners.activate(message, activityElement);
      }
    }
    function deactivate(message) {
      debug('deactivate');
      if (listeners && undefined !== listeners) {
        listeners.deactivate(message, activityElement);
      }
    }

    function execute(...args) {
      debug('execute %o', args);
    }
  }
};
