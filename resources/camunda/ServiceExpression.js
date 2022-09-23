'use strict';

const Debug = require('debug');

module.exports = function SereviceExpression(activityElement, parentContext) {
  const {id, $type} = activityElement;
  const type = `${$type}:expression`;
  const {environment} = parentContext;
  const debug = Debug(`bpmn-engine:${type.toLowerCase()}`);
  const expression = activityElement.expression || activityElement.behaviour.expression;

  return {
    type,
    expression,
    activate,
  };

  function activate(parentApi, inputContext) {
    const {isLoopContext, index} = inputContext;

    debug(`<${id}> service${isLoopContext ? ` loop context iteration ${index}` : ''} activated`);

    const serviceFn = environment.resolveExpression(expression, inputContext);
    return {
      type,
      execute
    };

    function execute(inputArg, callback) {
      if (typeof serviceFn !== 'function') return callback(new Error(`Expression ${expression} did not resolve to a function`));

      const inputArgs = Object.assign({}, { variables: environment.variables } );
      serviceFn.call(parentApi, inputArgs, (err, ...args) => {
        callback(err, args);
      });
    }
  }
};
