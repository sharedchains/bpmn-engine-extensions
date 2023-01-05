'use strict';

const factory = require('../../../helpers/factory');
const {apiUrl, getNockGet, initEngine} = require('../../../helpers/testHelpers');
const got = require('got');
const { expect } = require('chai');


describe('ServiceTask', () => {
  describe('io', () => {
    it('uses input parameters', () => {

      return new Promise((res, rej) => {
        getNockGet()
          .reply(200, {
            data: 4
          });

        const source = factory.resource('service-task-io.bpmn').toString();
        initEngine({
          source
          , variables: {
            apiUrl
          }
          , services: {
            getRequest: (context, callback) => {
              // here we check input variables are correctly set
              let { content } = context;
              expect(content.input).to.be.ok;
              expect(content.input).to.deep.equal({ uri: 'http://example.com/api', json: true } );
              got({
                url: content.input.uri,
                responseType: ( content.input.json ? 'json' : null )
              }).then(response => {
                callback(null,
                  { statusCode: response.statusCode }
                  , response.body
                );
              }).catch(err => {
                rej(err);
              });
            }
          }
        }).then(({engine, listener}) => {

          listener.on('activity.start', ({id, owner}) => {
            if (id === 'serviceTask') {
              try {
                expect(owner.getInput()).to.eql({ uri: apiUrl, json: true });
              } catch (ex) {
                rej(ex);
              }
            }
          });

          listener.on('activity.end', ({ id, owner }) => {
            try {
              if (id === 'serviceTask') {
                const output = owner.getOutput();
                expect(Object.keys(output)).to.have.same.members(['statusCode', 'body']);
                expect(output.statusCode).to.equal(200);
                expect(output.body).to.eql({ data: 4});
                res();
              }
            } catch (ex) {
              rej(ex);
            }
          });

          engine.execute({ listener }, (err) => {
            if (err) rej(err);
            rej('SHOULD NOT END');
          });
        });

      });

    });

    it('returns mapped output', () => {
      return new Promise((res, rej) => {
        return initEngine({
          source: factory.resource('service-task-io-types.bpmn')
          , variables: {
            apiPath: 'http://example-2.com',
            input: 2
          }
          , services: {
            get: ({variables}, next) => {
              next(null, [ {
                statusCode: 200
                , pathname: '/ignore'
              }
              , { data: variables.input } ]);
            }
          }
        }).then(({ engine, listener }) => {

          listener.on('activity.wait', (api) => {
            api.signal();
          });
          listener.on('activity.end', ({id, owner}) => {
            if (id === 'serviceTask') {
              try {
                const output = owner.getOutput();
                expect(output).to.eql({
                  statusCode: 200,
                  body: {
                    data: 2
                  }
                });
                res();
              } catch (ex) {
                rej(ex);
              }
            }
          });

          engine.execute({ listener }, (err) => {
            if (err) rej(err);
            rej('SHOULD NOT BE HERE');
          });
        });
      });
    });

    it('returns input context if no input parameters', () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:camunda="http://camunda.org/schema/1.0/bpmn">
        <process id="theProcess" isExecutable="true">
          <serviceTask id="ping" name="ping" implementation="\${environment.services.ping}">
            <extensionElements>
              <camunda:inputOutput>
                <camunda:outputParameter name="pinged" value="\${true}" />
              </camunda:inputOutput>
            </extensionElements>
          </serviceTask>
        </process>
      </definitions>`;

      return new Promise((res, rej) => {

        return initEngine(source).then(({ definition }) => {
          definition.environment.assignVariables({
            apiPath: 'http://example-2.com',
            input: 2,
          });
          definition.environment.addService('ping', (arg, next) => {
            try {
              // input is not set in arg.content
              expect(arg.content).to.have.property('input');
              expect(arg.content.inptu).to.be.undefined;
              const { variables } = arg.environment;
              expect(variables).to.have.property('apiPath');
              expect(variables).to.have.property('input');
              next();
            } catch (ex) {
              rej(ex);
            }
          });

          const task = definition.getActivityById('ping');
          task.once('end', (activityApi) => {
            try {
              const output = activityApi.owner.getOutput();
              expect(output).to.eql({
                pinged: true
              });
              res();
            } catch (ex) {
              rej(ex);
            }
          });

          task.run();
        });
      });
    });
  });

  describe('service', () => {
    it('resolves service from property named "service"', () => {
      return new Promise((res, rej) => {
        initEngine({
          source: factory.resource('issue-7.bpmn')
        }).then(({engine, listener}) => {

          listener.onAny((x) => { console.error(x); });
          listener.on('activity.execution.completed', ({ content, id }) => {
            console.error('COMPLETE!');
            try {
              if (id === 'Task_0kxsx8j') {
                expect(content.output).to.eql(['success']);
                res();
              }
            } catch (ex) {
              rej(ex);
            }
          });
          engine.execute({
            listener
            , services: {
              myCustomService: (_message, next) => {
                next(null, 'success');
              }
            }
          }, (err) => {
            if (err) rej(err);
            rej('should not be here');
          });
        });
      });
    });
  });
});
