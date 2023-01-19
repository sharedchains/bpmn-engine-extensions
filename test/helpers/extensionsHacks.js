'use strict';

function processResume(activity) {
  /*
  activity.broker.subscribeTmp('run', 'run.resume', (_eventName, message, api) => {
    console.error('>>>> RESUME: %o', message);
  }, { noAck: true, priority: 10000, durable: true });
  */
  activity.broker.subscribeTmp('format', '#', (_eventName, message, api) => {
    console.error('>>>> FORMAT: %o', message);
  }, { noAck: true, priority: 10000, durable: true });
}
function saveOutputToEnv(activity) {
  if (!activity.behaviour.io) return;
  activity.on('end', (activityApi, engineApi) => {
    const { content, owner } = activityApi;
    const output = content.output || owner.behaviour.io.getOutput();

    if (output) {
      const what = engineApi || activity;
      what.environment.output[activityApi.owner.id] = output;
    }
  });
}

module.exports = {
  processResume,
  saveOutputToEnv,
};
