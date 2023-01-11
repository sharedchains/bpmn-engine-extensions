'use strict';

const {Script} = require('vm');

module.exports = function Listener(listener, parentContext)
{
  const { event, script } = listener;
  const fields = listener.fields || {};
  const type = 'camunda:ExecutionListeners:'+event;
  const { environment } = parentContext;
  const { resources } = environment.options;
  const { debug } = environment.Logger(`bpmn-engine:${type.toLowerCase()}`);
  debug('listener: %o', listener);
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

  function activate(parentApi, executionContext) {
    discarded = false;
    const evt = event==='start' ? 'activity.enter' : 'activity.end';
    debug('activate[%o][%o] script:%o'
      , evt
      , parentApi.id
      , script);
    if (script.value) {
      jsScript = new Script(script.value);
    }

    const broker = parentApi.broker;

    debug('subscripe to %o', evt)
    broker.subscribeOnce('event', evt
      , (args) => {
        debug('execute: %o -> %o', parentApi.id, args);
        execute(parentApi, executionContext, resources);
      }, { noAck: true });

  }

  function execute(parentApi, executionContext, resources, callback) {
    if (null===resources)
      return ;

    if (discarded) {
	    debug(`${parentApi.id} was discarded!`);
      return ;
    }

    debug(`${parentApi.id} ${script.scriptFormat} -execute- resources: %o`, resources);

    if ('javascript'!==script.scriptFormat)
      return ;

    if (fields && fields.length>0) {
      for(let idx in fields) {
        fields[idx].value = parentApi.environment.resolveExpression(fields[idx].expression)
      }
      debug(`assigned fields: %o`, fields);
    }

    debug(`${parentApi.id} ${script.resource} exists ?`);
    if (script.resource && resources[script.resource])
    {
      let execFunc = resources[script.resource];
      
      if (execFunc instanceof Function) {
        debug(`${parentApi.id} ${script.resource} is a function`);
        execFunc(fields, parentApi, executionContext, callback);
        return ;
      }
      if (execFunc instanceof Object
      && execFunc.execute
      && execFunc.execute instanceof Function) {
        debug(`${parentApi.id} ${script.resource} has execute function`);
        execFunc.execute(fields, parentApi, executionContext, callback);
      }
      return ;
    }
    if (!jsScript) {
      debug(`${parentApi.id} I don't know what to do..`);
      return ;
    }

    debug(`${parentApi.id} has jsScript`);
      const timers = environment.timers.register(parentApi);
      return jsScript.runInNewContext({
          ...fields
          , ...parentApi
          , ...timers
          , next: (...args) => { if(callback) callback(args); }
        });
  }
}
