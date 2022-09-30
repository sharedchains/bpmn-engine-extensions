'use strict';

const camunda = require('../../resources/camunda');
const {Engine} = require('bpmn-engine');
const Debug = require('debug');
const { assert } = require('chai');
Debug.enable('-nock*,bpmn*,test*');
const debug = Debug('test');

module.exports = {
  getDefinition,
  getEngine,
  onceEvent,
  debug,
  fnHandler
};

function fnHandler(fn, ...args) {
  try {
    return fn(...args);
  } catch (ex) {
    assert.fail(ex.getMessage);
  }
}
function getEngine(source, ext = null) {
  const _ext = ext || camunda;
  return Engine(Object.assign({},
    { name: 'test-engine' },
    { source },
    ( _ext && _ext.extension ? { extensions: { camunda: _ext.extension }} : {} ),
    ( _ext && _ext.moddleOptions ? { moddleOptions: { camunda: _ext.moddleOptions } } : {})
  ));
}
async function getDefinition(source, ext = null) {

  const definitions = await getEngine(source, ext).getDefinitions();
  return definitions[0];
}


function onceEvent(emitter, eventName) {
  return new Promise((resolve) => {
    emitter.once(eventName, (...args) => {
      resolve(...args);
    });
  });
}
