'use strict';

const Debug = require('debug');
const {hasExpression, isSupportedScriptType} = require('./utils');
const {execute: executeScript, parse: parseScript} = require('./script-helper');

module.exports = Parameter;

function Parameter(parm, environment) {
  const {name, $type: type, value, definition} = parm;

  const {resolveExpression} = environment;

  const debug = Debug(`bpmn-engine:${type.toLowerCase()}`);

  const valueType = getValueType();

  debug(`init ${type} <${name}> as type ${valueType}`);

  let script, scriptName;
  if (valueType === 'script') {
    const {scriptFormat} = definition;
    if (!isSupportedScriptType(scriptFormat)) throw new Error(`${scriptFormat} is unsupported`);

    scriptName = `${name}.io`;
    script = parseScript(scriptName, definition.value);
  }

  const entries = getEntries(parm);

  return {
    name,
    type,
    valueType,
    activate
  };

  function activate(inputContext) {
    const activatedEntries = activateEntries();
    let resultValue;
    const context = Object.assign({}, inputContext, { environment });

    return {
      name,
      valueType,
      get,
      resolve,
      save,
      set
    };

    function get() {
      if (resultValue !== undefined) return resultValue;
      resultValue = internalGet(context);
      return resultValue;
    }

    function set(invalue) {
      resultValue = invalue;
    }

    function resolve(from) {
      return internalGet(from);
    }

    function internalGet(from) {
      let _value = null;
      switch (valueType) {
        case 'constant':
          _value = value;
          break;
        case 'expression':
          _value = resolveExpression(value, from);
          break;
        case 'script': {
          _value = executeScript(script, from);
          break;
        }
        case 'map':
          _value = getMap();
          break;
        case 'list':
          _value = getList();
          break;
        default:
          _value = getNamedValue(from);
      }

      //      debug('get %o value returned %o', debugType, _value);
      return _value;
    }

    function save() {
      debug(`salve <${name}> value`);
      environment.assignVariables({ [name]: get() });
    }

    function getMap() {
      if (!activatedEntries) return getNamedValue();

      return activatedEntries.reduce((result, entry) => {
        result[entry.name] = entry.get();
        return result;
      }, {});
    }

    function getNamedValue(from) {
      from = from || inputContext;
      let result = from[name];
      /*
      if (result === undefined && from.variables) {
        result = from.variables[name];
      }
      */
      if (result === undefined && from.environment.variables) {
        result = from.environment.variables[name];
      }
      return result;
    }

    function getList() {
      if (!activatedEntries) return getNamedValue();
      return activatedEntries.map((entry) => {
        return entry.get();
      });
    }

    function activateEntries() {
      if (!entries) return;
      return entries.map((entry) => entry.activate(inputContext));
    }
  }

  function getValueType() {
    if (value) {
      return hasExpression(value) ? 'expression' : 'constant';
    }
    if (definition && definition.$type) return definition.$type.replace(/^camunda:/, '').toLowerCase();
    return 'named';
  }

  function getEntries() {
    if (!definition) return;

    let parmEntries;
    if (definition.entries) {
      parmEntries = definition.entries.map((entry) => {
        return Parameter(Object.assign({name: entry.key, $type: `${type}:map`}, entry), environment);
      });
    } else if (definition.items) {
      parmEntries = definition.items.map((entry, idx) => {
        return Parameter(Object.assign({name: idx, $type: `${type}:list`}, entry), environment);
      });
    }

    return parmEntries;
  }
}
