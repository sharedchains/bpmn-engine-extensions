'use strict';

const getNormalizedResult = require('./getNormalizedResult');
const Parameter = require('./Parameter');

module.exports = function InputOutput(source, activityElement) {
  const { id, environment } = activityElement;
  const { $type: type, inputParameters: _input, outputParameters: _output } = source || {};
  const debug = activityElement.environment.Logger(`${activityElement.id || activityElement.name}:${type}`).debug;

  const inputParameters = _input && _input.map((parm) => Parameter(parm, environment));
  const outputParameters = _output && _output.map((parm) => Parameter(parm, environment));

  let returnInputContext = false;

  return {
    id,
    type,
    activate,
    allowReturnInputContext
  };

  function allowReturnInputContext(value) {
    if (value === undefined) return returnInputContext;
    returnInputContext = !!value;
    debug('>allowReturnInputContext %o', returnInputContext);
    return returnInputContext;
  }

  function activate(parentApi, inputContext) {
    const {id: activityId} = parentApi || {};
    const {isMultiInstance: isLoopContext, index} = inputContext ? inputContext.content || {} : {};

    let iParms, oParms, resultData;

    debug(`<${activityId}>${isLoopContext ? ` loop context iteration ${index}` : ''} activated`);
    const ioApi = {
      id,
      type,
      getInput,
      getOutput,
      getState,
      recover,
      save,
      setOutputValue,
      setResult
    };

    return ioApi;

    function getInput() {
      if (!inputParameters) return;
      const result = internalGetInput(true);
      if (!result && returnInputContext) {
        debug('getInput: (inputContext) %o', inputContext);
        let filter = { ...inputContext };
        delete filter.fields;
        delete filter.content;
        delete filter.properties;
        return filter;
      }
      debug('getInput: (internalGet) %o', (result || {}));
      return result || {};
    }

    function internalGetInput(returnUndefined) {
      if (!inputParameters) return;
      return getInputParameters().reduce((result, parm) => {
        const val = parm.get();
        if (val !== undefined || returnUndefined) {
          if (!result) result = {};
          result[parm.name] = val;
        }
        return result;
      }, undefined);
    }

    function getOutput() {
      if (isLoopContext) {
        return resultData;
      }

      if (!outputParameters) return resultData;

      const result = {};

      getOutputParameters().forEach((parm) => {
        const val = parm.get();
        if (val !== undefined) {
          result[parm.name] = val;
        }
      });

      return result;
    }

    function getState() {
      const result = {};

      const inputState = internalGetInput();
      if (inputState) result.input = inputState;

      return result;
    }

    function recover(ioState) {
      if (!ioState) return ioApi;

      if (ioState.input) {
        getInputParameters().forEach((parm) => parm.set(ioState.input[parm.name]));
      }

      return ioApi;
    }

    function save() {
      if (!outputParameters) return;

      getOutputParameters(true).forEach((parm) => {
        parm.save();
      });
    }

    function setOutputValue(name, value) {
      resultData = resultData || {};
      resultData[name] = value;
      oParms = null;
    }

    function setResult(result1, ...args) {
      if (args.length) {
        resultData = [result1, ...args];
      } else {
        resultData = result1;
      }
      oParms = null;
    }

    function getOutputContext() {
      const _inputContext = Object.assign({}
        , getInputContext()
        , getNormalizedResult(resultData || {}));
      debug('>>> I/O OUTPUT-CTX: %o', _inputContext);
      return _inputContext;
    }

    function getInputContext() {
      const _inputContext = Object.assign({}, inputContext);
      _inputContext.variables = Object.assign({}
        , _inputContext.variables
        , getInput()
      );
      debug('>>> I/O INPUT-CTX: %o', _inputContext);
      return _inputContext;
    }

    function getInputParameters() {
      if (iParms) return iParms;
      debug('> getInputParameters %o', inputParameters);
      debug('> getInputParameters CTX: %o', inputContext);
      if (!inputParameters) return [];
      iParms = inputParameters.map((parm) => parm.activate(inputContext));
      return iParms;
    }

    function getOutputParameters(reassign) {
      if (!outputParameters) return [];
      debug('> getOutputParameters %o', (reassign ? ' reassign' : (oParms?' has oParms':'')));
      if (!reassign && oParms) return oParms;
      const outputContext = getOutputContext();
      oParms = outputParameters.map((parm) => parm.activate(outputContext));
      return oParms;
    }
  }
};
