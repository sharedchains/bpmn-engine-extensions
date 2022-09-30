'use strict';

const Debug = require('debug');
const getNormalizedResult = require('./getNormalizedResult');
const Parameter = require('./Parameter');

module.exports = function InputOutput(activity, parentContext, form) {
  const { id, environment } = parentContext;
  const type = activity.$type;
  const debug = Debug(`bpmn-engine:${type}`);

  const inputParameters = activity.inputParameters && activity.inputParameters.map((parm) => Parameter(parm, environment));
  const outputParameters = activity.outputParameters && activity.outputParameters.map((parm) => Parameter(parm, environment));

  let returnInputContext = false;

  return {
    id,
    type,
    activate,
    allowReturnInputContext,
    resume: resumeIo
  };

  function resumeIo(parentApi, inputContext, ioState) {
    return activate(parentApi, inputContext).resume(ioState);
  }

  function allowReturnInputContext(value) {
    if (value === undefined) return returnInputContext;
    returnInputContext = !!value;
    debug('>allowReturnInputContext %o', returnInputContext);
    return returnInputContext;
  }

  function activate(parentApi, inputContext) {
    const {id: activityId} = parentApi || {};
    const {isLoopContext, index} = inputContext ? inputContext.content || {} : {};

    let formInstance, iParms, oParms, resultData;

    debug(`<${activityId}>${isLoopContext ? ` loop context iteration ${index}` : ''} activated`);
    const ioApi = {
      id,
      type,
      getForm,
      getInput,
      getOutput,
      getState,
      resume,
      save,
      setOutputValue,
      setResult
    };

    return ioApi;

    function getForm() {
      if (!form) return;
      if (formInstance) return formInstance;
      formInstance = form.activate(parentApi, getInputContext());
      return formInstance;
    }

    function getInput() {
      const result = internalGetInput(true);
      if (!result && returnInputContext) {
        debug('getInput: (inputContext) %o', inputContext);
        return inputContext;
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
        if (formInstance) return formInstance.getOutput();
        return resultData;
      }

      if (!outputParameters) return;

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
      if (formInstance) {
        Object.assign(result, formInstance.getState());
      }

      return result;
    }

    function resume(ioState) {
      if (!ioState) return ioApi;

      const ioForm = getForm();
      if (ioForm) ioForm.resume(ioState);

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
    }

    function setResult(result1, ...args) {
      if (args.length) {
        resultData = [result1, ...args];
      } else {
        resultData = result1;
      }
    }

    function getOutputContext() {
      const _inputContext = getInputContext();
      _inputContext.variables = Object.assign({}
        , _inputContext.variables
        , getNormalizedResult(resultData || {}));
      debug('>>> OUTPUT-CTX: %o', _inputContext);
      return _inputContext;
    }

    function getInputContext() {
      const _inputContext = Object.assign({}, inputContext);
      _inputContext.variables = Object.assign({}
        , _inputContext.variables
        , getInput()
      );
      debug('>>> INPUT-CTX: %o', _inputContext);
      return _inputContext;
    }

    function getInputParameters() {
      debug('> getInputParameters %o', (iParms?' has IParms':''));
      if (iParms) return iParms;
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
