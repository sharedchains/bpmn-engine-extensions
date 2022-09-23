'use strict';

const {Engine} = require('bpmn-engine');

module.exports = {
  getDefinition,
  getEngineAndDefinition,
  onceEvent
};

async function getEngineAndDefinition(source, camundaExtensions, listener = null) {
  const engine = Engine({
    source,
    extensions: { camunda: camundaExtensions.extension },
    moddleOptions: { camunda: camundaExtensions.moddleOptions },
    listener: listener
  });

  const x = await engine.getDefinitions();
  return new Promise((resolve) => {
    resolve({ definition: x[0], engine });
  });
}

async function getDefinition(source, camundaExtensions, listener = null) {
  return getEngineAndDefinition(source, camundaExtensions, listener).then(data => {
    return data.definition;
  });
}


function onceEvent(emitter, eventName) {
  return new Promise((resolve) => {
    emitter.once(eventName, (...args) => {
      resolve(...args);
    });
  });
}
