'use strict';

const Debug = require('debug');

module.exports = function ServiceProperty(activityElement
  , parentContext
  , properties) {
  const id = activityElement.id;
  const $type = activityElement.behaviour.$type;
  const serviceProperty = properties.getProperty('service');
  const type = `${$type}:property`;
  const {environment} = parentContext;
  const propValues = {};
  const debug = Debug(`bpmn-engine:service:${type.toLowerCase()}:${id}`);

  debug(`prop:${type} ${activityElement.name}`);
  return {
    type,
    activate,
    deactivate
  };

  function deactivate() {
    debug('deactivate');
  }

  function activate(parentApi, inputContext) {
    const {isLoopContext, index} = inputContext;

    debug(`service${isLoopContext ? ` loop context iteration ${index}` : ''} activated`);

    const property = serviceProperty.activate(inputContext);
    for (const name in properties.getAll()) {
      propValues[name] = properties.getProperty(name).activate(inputContext);
    }
    const serviceFn = getServiceFn();
    debug('serviceFn value=%o', serviceFn);

    return {
      type,
      execute
    };

    function execute(inputArg, callback) {
      debug('execute: %o', serviceFn);
      debug('execute-context: %o', inputContext);
      debug('execute-inputArg: %o', inputArg);
      if (typeof serviceFn !== 'function') return callback(new Error(`Property ${property.name} did not resolve to a function`));

      inputArg.content.message = inputContext.content.message;
      serviceFn.call(parentApi, { inputArg, activityElement, properties: propValues }, (err, ...args) => {

        debug('**OUTPUT: %o', args);
        if (err) {
          debug(`<${id}> error: ${err.message}`);
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
  }
};
