'use strict';

const Debug = require('debug');
const getNormalizedResult = require('./getNormalizedResult');
const {hasExpression} = require('./utils');

module.exports = function ResultVariableIo(activityElement, {environment}) {
  const {id, $type, resultVariable} = activityElement;
  const type = `${$type}:resultvariable`;
  const debug = Debug(`bpmn-engine:${type.toLowerCase()}`);
  debug('ResultVariable element: %o', activityElement);

  return {
    id,
    type,
    activate,
  };

  function activate(parentApi, inputContext) {
    const {isLoopContext, index} = inputContext;
    const isExpression = hasExpression(resultVariable);

    let formInstance, variableName, resultData;

    debug(`<${id}>${isLoopContext ? ` loop context iteration ${index}` : ''} activated`);

    const ioApi = {
      id,
      type,
      getInput,
      getOutput,
      getState,
      save,
      setOutputValue,
      setResult
    };

    return ioApi;

    function getInput() {
      return inputContext;
    }

    function getOutput() {
      if (isLoopContext) {
        return resultData;
      }

      return resultData;
    }

    function getState() {
      const result = {};
      if (formInstance) {
        Object.assign(result, formInstance.getState());
      }
      return result;
    }

    function save() {
      const name = getVariableName(true);
      const value = resultData;
      if (!name || value === undefined) return;

      environment.output[name] = value;
    }

    function setOutputValue(name, value) {
      resultData = resultData || {};
      resultData[name] = value;
    }

    function setResult(result1, ...args) {
      const name = getVariableName(true);
      if (args.length) {
        resultData = { [name]: [result1, ...args] };
      } else {
        resultData = { [name]: result1 };
      }
    }

    function getOutputContext() {
      return Object.assign(inputContext, getNormalizedResult(resultData || {}));
    }

    function getVariableName(reassign) {
      if (!reassign && variableName) return variableName;
      if (isExpression) {
        variableName = environment.resolveExpression(resultVariable, getOutputContext());
      } else {
        variableName = resultVariable;
      }

      return variableName;
    }
  }
};
