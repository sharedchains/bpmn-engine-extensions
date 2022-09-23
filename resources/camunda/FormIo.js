'use strict';

const Debug = require('debug');
const getNormalizedResult = require('./getNormalizedResult');

module.exports = function FormIo(form, {environment}) {
  const {id, type: formType} = form;
  const type = `${formType}:io`;
  const debug = Debug(`bpmn-engine:${type.toLowerCase()}`);

  return {
    id,
    type,
    activate,
    resume: resumeIo
  };

  function resumeIo(parentApi, inputContext, ioState) {
    const ioApi = activate(parentApi, inputContext);
    ioApi.resume(ioState);
    return ioApi;
  }

  function activate(parentApi, inputContext) {
    let formInstance;

    const {id: activityId} = parentApi;
    const {loop, index} = inputContext;

    debug(`<${activityId}>${loop ? ` loop context iteration ${index}` : ''} activated`);

    return {
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

    function getForm(context) {
      const ctxObject = Object.assign({}, inputContext, context);
      if (formInstance && (!context || !ctxObject.content.isMultiInstance)) return formInstance;
      formInstance = form.activate(parentApi, ctxObject);
      return formInstance;
    }

    function getInput(context) {
      return getForm(context).getInput();
    }

    function getOutput(context) {
      return getForm(context).getOutput();
    }

    function getState() {
      return formInstance && formInstance.getState();
    }

    function resume(ioState) {
      if (!ioState) return;
      getForm().resume(ioState);
    }

    function save(context) {
      if (!getForm(context)) return;
      environment.assignVariables(getOutput());
    }

    function setOutputValue(name, value) {
      getForm().setFieldValue(name, value);
    }

    function setResult(value) {
      if (value === undefined) return;

      const normalized = getNormalizedResult(value);
      const loadedForm = getForm();
      for (const key in normalized) {
        loadedForm.setFieldValue(key, normalized[key]);
      }
    }
  }
};
