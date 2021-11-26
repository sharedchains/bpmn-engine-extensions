'use strict';

const Debug = require('debug');
const getNormalizedResult = require('./getNormalizedResult');

module.exports = function Connector(activityElement
      , parentContext
      , serviceProperty) {
  const id = activityElement.id;
  const $type = activityElement.behaviour.$type;
  const type = `${$type}:property`;
  const {environment} = parentContext;
  const debug = Debug(`bpmn-engine:${type.toLowerCase()}:${id}`);

  debug(`prop:${type}`);
  return {
    type,
    activate,
    deactivate
  };

  function deactivate(..._args) {
      debug('deactivate');
  }

  function activate(parentApi, inputContext) {
    const {isLoopContext, index} = inputContext;

    debug(`service${isLoopContext ? ` loop context iteration ${index}` : ''} activated`);

    const property = serviceProperty.activate(inputContext);
    const serviceFn = getServiceFn();
    debug('serviceFn value=%o', serviceFn);

    return {
      type,
      execute
    };

    function execute(inputArg, callback) {
      debug('execute: %o', serviceFn);
      if (typeof serviceFn !== 'function') return callback(new Error(`Property ${property.name} did not resolve to a function`));

      serviceFn.call(parentApi, { inputArg, activityElement }, (err, ...args) => {

        debug('**OUTPUT: %o', args);
        if (err) {
          debug(`<${id}> errored: ${err.message}`);
        } else {
          debug(`<${id}> completed`);
        }
        return callback(err, args);
      });
    }

    function getServiceFn() {
      const value = property.get();
      debug('getService value=%o', value);
      if (typeof value === 'function') return value;
      return environment.getServiceByName(value);
    }

    function getOutput(result) {
      if (!outputParameters) return result;

      const resolveResult = getNormalizedResult(result);

      return getOutputParameters().reduce((output, parm, idx) => {
        if (parm.valueType === 'expression') {
          output[parm.name] = parm.resolve(resolveResult);
        } else {
          output[parm.name] = result[idx];
        }
        return output;
      }, {});
    }

    function getOutputParameters(reassign) {
      if (!outputParameters) return [];
      if (!reassign && oParms) return oParms;
      oParms = outputParameters.map((parm) => parm.activate(inputContext));
      return oParms;
    }
  }
};
