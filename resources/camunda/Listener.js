'use strict';

const Debug = require('debug');
const {Script} = require('vm');

module.exports = function Listener(listener, parentContext)
{
  const { event, script, fields } = listener;
  const type = 'camunda:ExecutionListeners:'+event;
  const debug = Debug(`bpmn-engine:${type.toLowerCase()}`);
  const moddle = listener;
  const { environment } = parentContext;
  var jsScript = null;

  return {
	  type
    , event
    , execute
    , activate
  }

  function activate(context)
  {
    debug('activate');
    if (script.value)
    {
      this.jsScript = new Script(script.value);
    }
  }

  function execute(elementApi, engineApi, resources, callback)
  {
    if (null===resources)
      return ;

	  debug(`${elementApi.id} -execute- moddle: %o`, moddle);
    debug(`${elementApi.id} -execute- context: %o`, parentContext); 
    debug(`${elementApi.id} -execute- engine: %o`, engineApi);
    debug(`${elementApi.id} -execute- resources: %o`, resources);

    if ('javascript'!==script.scriptFormat)
      return ;

    if (fields.length>0)
    {
      for(let idx in fields)
      {
        fields[idx].value = elementApi.environment.resolveExpression(fields[idx].expression)
      }
    }
    if (script.resource && resources.hasOwnProperty(script.resource))
    {
      let execFunc = resources[script.resource];
      
      if (execFunc instanceof Function)
        execFunc(fields, elementApi, engineApi, callback);
      if (execFunc instanceof Object
      && execFunc.execute
      && execFunc.execute instanceof Function)
        execFunc.execute(fields, elementApi, engineApi, callback);
      return ;
    }
    if (null!==this.jsScript)
    {
      const timers = environment.timers.register(elementApi);
      return this.jsScript.runInNewContext({...fields
          , ...elementApi
          , ...timers
          , next: (...args) => { callback(args); }});
    }
  }
}