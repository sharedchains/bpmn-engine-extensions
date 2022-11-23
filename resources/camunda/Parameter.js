'use strict';

const Debug = require('debug');
const {hasExpression, isSupportedScriptType} = require('./utils');
const {execute: executeScript, parse: parseScript} = require('./script-helper');

module.exports = Parameter;

function Parameter(parm, environment) {
  const {name, $type: type, value, definition} = parm;

  const {resolveExpression} = environment.expressions;

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
      resultValue = internalGet();
      return resultValue;
    }

    function set(invalue) {
      resultValue = invalue;
    }

    function resolve(from = {}) {
      return internalGet(from);
    }

    function internalGet(from = {}) {
      let _value = null;
      let loopArgs = {};
      if (inputContext && inputContext.content && inputContext.content.isMultiInstance) {
        loopArgs = {
          item: inputContext.content.item
          , index: inputContext.content.index
          , loopCardinality: inputContext.content.loopCardinality
        };
      }
      const ctx = { ...loopArgs, ...inputContext, ...from, environment };
      /*
      const ctx = Object.assign({}, from
        , { variables: Object.assign({}
          , from.environment ? from.environment.variables : {}
          , from.content && from.content.message ? from.content.message.variables : {}
          , from.content
          , from.variables
          , { environment }
        )
        });
      */
      switch (valueType) {
        case 'constant':
          debug('assign %o constant: %o', name, value);
          _value = value;
          break;
        case 'expression':
          _value = resolveExpression(value, ctx);
          debug('resolveExpression %o variables: %o result: %o', value, ctx, _value);
          break;
        case 'script': {
          debug('executeScript variables: %o result: %o', ctx, _value);
          _value = executeScript(script, ctx);
          debug('executeScript %o variables: %o result: %o', value, ctx, _value);
          break;
        }
        case 'map':
          _value = getMap(ctx);
          break;
        case 'list':
          _value = getList();
          break;
        default:
          _value = getNamedValue({ ...environment.variables, ...ctx });
          debug('getNamed: %o value: %o, ctx: %o result: %o', name, value, ctx, _value);
      }

      //      debug('get %o value returned %o', debugType, _value);
      return _value;
    }

    function save() {
      const saveObj = { [name]: get() };
      debug(`save <${name}> value '${JSON.stringify(saveObj[name])}'`);
      environment.assignVariables(saveObj);
    }

    function getMap(context) {
      if (!activatedEntries) return getNamedValue(context);

      return activatedEntries.reduce((result, entry) => {
        result[entry.name] = entry.get();
        return result;
      }, {});
    }

    function getNamedValue(from) {
      from = from || inputContext;
      let result = from[name];
      /** TODO: Verificare se ha senso... 
      if (result === undefined && from.variables) {
        result = from.variables[name];
      }
      */
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
