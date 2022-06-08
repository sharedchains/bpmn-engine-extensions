'use strict';

const Debug = require('debug');
const {Script} = require('vm');

module.exports = function Listener(listener, parentContext)
{
  const { event, script, fields } = listener;
  const type = 'camunda:ExecutionListeners:'+event;
  const debug = Debug(`bpmn-engine:${type.toLowerCase()}`);
  debug('listener: %o', listener);
  const { environment } = parentContext;
  const { resources } = environment.options;
  var jsScript = null;
  let discarded = false;

  return {
	  type
    , event
    , execute
    , activate
    , deactivate
  }

  function deactivate(_context, activityElement)
  {
    discarded = true;
    const evt = event==='start' ? 'activity.enter' : 'activity.end';
    debug('discard:%o -> %o', activityElement.id, evt);
  }

  function activate(_context, activityElement)
  {
    discarded = false;
    const evt = event==='start' ? 'activity.enter' : 'activity.end';
    debug('activate[%o][%o] script:%o'
      , evt
      , activityElement.id
      , script);
    if (script.value)
    {
      this.jsScript = new Script(script.value);
    }

    const broker = activityElement.broker;

    debug('subscripe to %o', evt)
    broker.subscribeOnce('event', evt
      , (args) => {
        debug('execute: %o -> %o', activityElement.id, args);
        execute(activityElement, parentContext, resources);
      }, { noAck: true });

  }

  function execute(elementApi, engineApi, resources, callback)
  {
    if (null===resources)
      return ;

    if (discarded)
    {
	    debug(`${elementApi.id} was discarded!`);
      return ;
    }

    /*
	  debug(`${elementApi.id} -execute- moddle: %o`, moddle);
    debug(`${elementApi.id} -execute- context: %o`, parentContext); 
    debug(`${elementApi.id} -execute- engine: %o`, engineApi);
    */
    debug(`${elementApi.id} -execute- resources: %o`, resources);

    if ('javascript'!==script.scriptFormat)
      return ;

    if (fields && fields.length>0)
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
    if (null!==jsScript)
    {
      const timers = environment.timers.register(elementApi);
      return this.jsScript.runInNewContext({
          ...fields
          , ...elementApi
          , ...timers
          , next: (...args) => { callback(args); }});
    }
  }
}
