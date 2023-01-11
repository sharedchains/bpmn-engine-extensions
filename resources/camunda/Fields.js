'use strict';

const Field = require('./Field');

module.exports = Fields;

function Fields(elements, environment) {
  const fields = elements.map((element) => Field(element, environment));
  return {
    get
    , setFieldValue
    , getFieldValue
  };

  function get() {
    const result = {};
    fields.map(field => {
      result[field.name] = field.get();
    });
    return result;
  }

  function setFieldValue(name, value) {
    if (!fields[name]) {
      fields[name] = Field({ name, string: value, $type: 'camunda:Field'}, {});
    }
    fields[name].set(value);
  }

  function getFieldValue(name) {
    if (fields[name]) return fields[name].get();
  }
}