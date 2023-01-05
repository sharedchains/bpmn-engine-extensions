'use strict';

const Activity = require('./activities');
const Form = require('./Form');
const FormKey = require('./FormKey');
const InputOutput = require('./InputOutput');
const Properties = require('./Properties');
const Listeners = require('./Listeners');
const ResultVariableIo = require('./ResultVariableIo');
const moddleOptions = require('camunda-bpmn-moddle/resources/camunda');

module.exports = {
  extension: Camunda,
  moddleOptions
};

function Camunda(activityElement, parentContext) {
  const behaviour = activityElement.behaviour;
  const { extensionElements, formKey } = behaviour;
  const hasExtValues = extensionElements && extensionElements.values;
  activityElement.logger.debug(`Camunda(construct) ${activityElement.id}:${activityElement.name || 'no-name'}`);

  const listeners = loadListeners();
  const properties = loadProperties();
  const form = loadForm();
  const io = loadIo();

  return Activity({
    io,
    properties,
    listeners,
    form
  }, activityElement, parentContext);

  function loadIo() {
    if (hasExtValues) {
      const source = extensionElements.values.find((elm) => elm.$type === 'camunda:InputOutput');
      if (source) return InputOutput(source, activityElement);
    }
    if (activityElement.behaviour.resultVariable) {
      return ResultVariableIo(activityElement.behaviour, parentContext);
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
