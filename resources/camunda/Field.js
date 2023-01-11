'use strict';

module.exports = Field;

function Field(parm, environment) {
  const {name, expression, string} = parm;
  const {resolveExpression} = environment.expressions;
  let resultValue;

  return {
    name,
    get,
    set
  };

  function set(invalue) {
    resultValue = invalue;
  }

  function get() {
    if (resultValue !== undefined) return resultValue;
    resultValue = internalGet();
    return resultValue;
  }

  function internalGet() {
    if (string) return string;
    return resolveExpression(expression, environment);
  }
}
