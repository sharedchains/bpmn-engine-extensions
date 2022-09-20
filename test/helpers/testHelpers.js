'use strict';

const {Engine} = require('bpmn-engine');

module.exports = {
  getDefinition,
  onceEvent
};

async function getDefinition(source, camundaExtensions) {
  const engine = Engine({
    source,
    extensions: { camunda: camundaExtensions.extension },
    moddleOptions: { camunda: camundaExtensions.moddleOptions }
  });

  const x = await engine.getDefinitions();
  return new Promise((resolve) => {
    resolve(x[0]);
  });
}

function onceEvent(emitter, eventName) {
  return new Promise((resolve) => {
    emitter.once(eventName, (...args) => {
      resolve(...args);
    });
  });
}
