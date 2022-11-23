'use strict';

const FormField = require('./FormField');

module.exports = function FormKey(activityElement) {
  const {id, environment, behaviour } = activityElement;
  const type = 'camunda:formKey';
  const { formKey: _formKey } = behaviour;

  const debug = environment.Logger(`bpmn-engine:x:${type.toLowerCase()}`).debug;
  debug('loaded for %o', id);
  return {
    id,
    type,
    activate
  };

  function activate(parentApi, inputContext) {
    const fields = [];
    let formKey = inputContext.form && inputContext.form.formKey ? inputContext.form.formKey
      : environment.resolveExpression(_formKey, { ...inputContext, ...activityElement.getInput() });
    const {index, isLoopContext} = inputContext;

    const {id: activityId} = parentApi;
    debug(`<${activityId}>${isLoopContext ? ` loop context iteration ${index}` : ''} form key <${formKey}> activated`);

    const formApi = {
      id: formKey,
      formKey,
      key: formKey,
      type,
      activate,
      getField,
      getFields,
      getFieldValue,
      getInput,
      getOutput,
      getState,
      reset,
      recover,
      setFieldValue
    };

    return formApi;

    function getField(fieldId) {
      return internalCreateField(fieldId);
    }

    function getFields() {
      return internalGetFields().slice();
    }

    function setFieldValue(fieldId, value) {
      return internalCreateField(fieldId).set(value);
    }

    function getFieldValue(fieldId) {
      const field = getField(fieldId);
      if (field) return field.get();
    }

    function getState() {
      const fieldState = getFieldState();
      const result = {
          formKey
      };

      if (fieldState.length) {
        result.fields = fieldState;
      }

      return result;
    }

    function getInput() {
      return internalGetFields().reduce((result, f) => {
        result[f.id] = f.get();
        return result;
      }, {});
    }

    function getOutput() {
      return fields.reduce((result, f) => {
        result[f.id] = f.get();
        return result;
      }, {});
    }

    function recover(state) {
      debug('recover!');
      if (!state || !state.form) return;

      const {formKey: stateFormKey, fields: stateFields} = state.form;
      formApi.id = formApi.formKey = formKey = stateFormKey || formKey;

      if (stateFields) {
        stateFields.forEach((stateField) => {
          const field = internalCreateField(stateField.id);
          field.set(stateField.value);
        });
      }
      return formApi;
    }

    function internalCreateField(fieldId) {
      let field = fields.find((f) => f.id === fieldId);
      if (field) return field;

      field = FormField({id: fieldId, $type: `${formKey}:field`}, inputContext, environment);

      fields.push(field);

      return field;
    }

    function internalGetFields() {
      return fields;
    }

    function reset() {
      fields.splice();
    }

    function getFieldState() {
      return internalGetFields().reduce((result, f) => {
        const fieldState = f.getState();
        if (fieldState.value) result.push(fieldState);
        else if (fieldState.label) result.push(fieldState);
        return result;
      }, []);
    }
  }
};
