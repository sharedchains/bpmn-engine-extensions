'use strict';

const Debug = require('debug');

module.exports = function ServiceExpression(activityElement, _) {
  const {id, $type, environment} = activityElement;
  const type = `${$type}:expression`;
  const debug = Debug(`bpmn-engine:${type.toLowerCase()}`);
  const expression = activityElement.behaviour.expression;

  return {
    type,
    expression,
    activate,
    execute,
  };

  function activate(_, inputContext) {
    const {isLoopContext, index} = inputContext;

    debug(`<${id}> service${isLoopContext ? ` loop context iteration ${index}` : ''} activated`);

    return {
      type,
      execute
    };
  }
  function execute(inputArg, callback) {
    const inputs = activityElement.getInput()
    const from = Object.assign({},
      inputArg
      , inputs
      , { environment: activityElement.environment }
    );
    const serviceFn = environment.expressions.resolveExpression(expression, from);
    if (typeof serviceFn !== 'function') return callback(new Error(`Expression ${expression} did not resolve to a function`));

    const inputArgs = Object.assign({}, inputArg.content
      , inputs
      , { variables: environment.variables } );
    serviceFn.call(activityElement, inputArgs, (err, ...args) => {
      callback(err, args);
    });
  }
};
