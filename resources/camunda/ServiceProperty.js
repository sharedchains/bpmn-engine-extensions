'use strict';

module.exports = function ServiceProperty(activityElement
  , parentContext
  , properties) {
  const { id, environment } = activityElement;
  const type = activityElement.behaviour.$type;
  const { debug } = environment.Logger(type);

  function getServiceFn(property) {
    const value = property.get();
    debug('getService value=%o', value);
    if (typeof value === 'function') return value;
    return environment.getServiceByName(value);
  }

  const servicePropertyFunction = function(activity, inputContext) {
    this.type = type;
    this.activity = activity;
    const {isLoopContext, index} = inputContext;

    debug(`service${isLoopContext ? ` loop context iteration ${index}` : ''} activated`);

    const propValues = {};
    for (const name in properties.getAll()) {
      propValues[name] = properties.getProperty(name).activate(inputContext);
    }
    const serviceProperty = propValues['service'];
    const serviceFn = getServiceFn(serviceProperty);
    debug('serviceFn value=%o', serviceFn);

    this.execute = function execute(inputArg, callback) {
      debug('execute: %o', serviceFn);
      debug('execute-context: %o', inputContext);
      debug('execute-inputArg: %o', inputArg);
      if (typeof serviceFn !== 'function') return callback(new Error(`Property ${serviceProperty.name} did not resolve to a function`));

      inputArg.content.message = inputContext.content.message;
      serviceFn.call(activity, { inputArg, activityElement, properties: propValues }, (err, ...args) => {

        debug('**OUTPUT: %o', args);
        if (err) {
          debug(`<$id}> error: ${err.message}`);
        } else {
          debug(`<${id}> completed`);
        }
        return callback(err, args);
      });
    };
  };
  return servicePropertyFunction;

};
