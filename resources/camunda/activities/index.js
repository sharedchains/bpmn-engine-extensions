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
  const debug = Debug(`bpmn-engine:camunda:activity:${$type.toLowerCase()}:${id}`);

  switch ($type) {
    case 'bpmn:ServiceTask': return ServiceTask(extensions, activityElement, parentContext);
    case 'bpmn:ScriptTask': return ScriptTask(extensions, activityElement, parentContext);
/*    case 'bpmn:BoundaryEvent': return BoundaryEvent(extensions, activityElement, parentContext); */
    case 'bpmn:CallActivity': return CallActivity(extensions, activityElement, parentContext);
    case 'bpmn:IntermediateThrowEvent': return IntermediateEvent(extensions, activityElement, parentContext);
    case 'bpmn:IntermediateCatchEvent': return IntermediateEvent(extensions, activityElement, parentContext);
    case 'bpmn:StartEvent': return StartEvent();
    default:
      return Base();
  }

  function StartEvent() {
    if (eventDefinitions) {
      const hasMessage = eventDefinitions.find(event => {
        return event.behaviour.$type === 'bpmn:MessageEventDefinition';
      });
      if (hasMessage) return IntermediateEvent(extensions, activityElement, parentContext);
    }
    return Base();
  }

  function Base() {
    debug('BASE');
    debug(io);
    let loadedIo = io;
    if (!loadedIo && form) {
      loadedIo = FormIo(form, parentContext);
    }

    activityElement.listeners = listeners;
    activityElement.behaviour.io = loadedIo;
    return { activate, deactivate };
    /*
    return Object.assign({},extensions, {
       activate, deactivate, io: loadedIo, properties, listeners, id, $type }
       , ( form ? { form: loadedIo } : {} )
    );
    */

    function activate(message) {
      debug('BASE - activate - message: %o', message);
      if (listeners && undefined !== listeners) {
        listeners.activate(message, activityElement);
      }
      if (loadedIo && loadedIo.activate) {
        debug('activate io');
        activityElement.behaviour.io = loadedIo.activate(activityElement, message);
      }
    }
    function deactivate(message) {
      debug('BASE - deactivate');
      if (listeners && undefined !== listeners) {
        listeners.deactivate(message, activityElement);
      }
      const ioApi = activityElement.behaviour.io;
      if (ioApi && ioApi.setResult) ioApi.setResult(message.content.output);
    }
  }
};
