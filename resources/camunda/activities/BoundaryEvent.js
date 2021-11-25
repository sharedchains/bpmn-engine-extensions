'use strict';

const ElementPropertyIo = require('../ElementPropertyIo');
const Debug = require('debug');

module.exports = function BoundaryEvent(extensions, activityElement, parentContext) {
  const {eventDefinitions} = activityElement;
  const {io, properties, listeners} = extensions;
  const debug = Debug(`bpmn-engine:${activityElement.id}`);

  extensions.io = loadIo();
  extensions.activate = (message) => {
    debug('activate: %o', listeners);
    if (listeners)
        listeners.activate(message);
  }
  extensions.deactivate = (message) => {
    debug('activate');
    if (listeners)
      listeners.deactivate(message);
  }
  activityElement.behaviour.Service = (...args) => {
    console.warn('EXECUTE!! %o', args);
  }

  debug(` extensions:%o`, extensions);
  return extensions;

  function loadIo() {
    if (io) return io;
    if (!eventDefinitions) return;

    const elementPropertyIo = ElementPropertyIo(activityElement, parentContext);

    eventDefinitions.forEach((ed) => {
      if (ed.$type === 'bpmn:ErrorEventDefinition') {
        if (ed.errorCodeVariable) elementPropertyIo.addOutputParameter('errorCode', ed.errorCodeVariable);
        if (ed.errorMessageVariable) elementPropertyIo.addOutputParameter('errorMessage', ed.errorMessageVariable);
      }
    });

    return elementPropertyIo.getInfo().output.length ? elementPropertyIo : undefined;
  }
};
