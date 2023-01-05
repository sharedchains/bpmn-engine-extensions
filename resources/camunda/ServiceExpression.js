'use strict';

const Debug = require('debug');

const ServiceExpression = function(activity, _) {
  const { $type } = activity;
  const type = `${$type}:expression`;
  const debug = Debug(`bpmn-engine:${type.toLowerCase()}`);

  const serviceExpressionObj = function(activityElement, inputContext) {
    const {id, environment} = activityElement;
    const expression = activityElement.behaviour.expression;
    const {isLoopContext, index} = inputContext;

    debug(`<${id}> service${isLoopContext ? ` loop context iteration ${index}` : ''} activated`);

    this.execute = (inputArg, callback) => {
      const inputs = activityElement.getInput();
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
        console.log('>>>> Service: %O', serviceFn);
      serviceFn.call(activityElement, inputArgs, (err, ...args) => {
        callback(err, args);
      });
    };
  };
  return serviceExpressionObj;
};

module.exports = ServiceExpression;
