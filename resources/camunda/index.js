'use strict';

const Activity = require('./activities');
const Form = require('./Form');
const FormKey = require('./FormKey');
const InputOutput = require('./InputOutput');
const Properties = require('./Properties');
const Listeners = require('./Listeners');
const ResultVariableIo = require('./ResultVariableIo');
const moddleOptions = require('camunda-bpmn-moddle/resources/camunda');
const Debug = require('debug');

module.exports = {
  extension: Camunda,
  moddleOptions
};

function Camunda(activityElement, parentContext) {
  const behaviour = activityElement.behaviour;
  const { extensionElements, formKey } = behaviour;
  const hasExtValues = extensionElements && extensionElements.values;
  const { type, id } = activityElement;
  const debug = Debug(`bpmn-engine:camunda:${type}:${id}`);
  debug('init-activity: %o', activityElement);
  debug('init-parent: %o', parentContext);
  debug('init-hasExtValues: %o', hasExtValues);
  const listeners = loadListeners();
  const properties = loadProperties();
  const form = loadForm();
  const io = loadIo(form);

  debug('init-Activity(%o)', id);
  return Activity({
    io,
    properties,
    listeners,
    form
  }, activityElement, parentContext);

  function loadIo(loadedForm) {
    if (hasExtValues) {
      const source = extensionElements.values.find((elm) => elm.$type === 'camunda:InputOutput');
      if (source) return InputOutput(source, parentContext, loadedForm);
    }
    if (activityElement.resultVariable) {
      return ResultVariableIo(activityElement, parentContext, loadedForm);
    }
  }

  function loadForm() {
    if (hasExtValues) {
      const source = extensionElements.values.find(elm => elm.$type === 'camunda:FormData');
      if (source) return Form(source, parentContext);
    }

    if (formKey) return FormKey(activityElement, parentContext);
  }

  function loadProperties() {
    if (!hasExtValues) return;

    const source = extensionElements.values.find(elm => elm.$type === 'camunda:Properties');
    if (source) return Properties(source, parentContext);
  }

  function loadListeners() {
    if (!hasExtValues) return;

    const execListeners = extensionElements.values.filter(elm => elm.$type === 'camunda:ExecutionListener');
    if (execListeners) {
      return Listeners(execListeners, parentContext);
    }
  }
}
