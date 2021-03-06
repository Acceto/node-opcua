require("requirish")._(module);

var OPCUAServer = require("lib/server/opcua_server").OPCUAServer;
var should = require("should");
var util = require("util");
var async = require("async");
var _ = require("underscore");
var assert = require("better-assert");
var debugLog = require("lib/misc/utils").make_debugLog(__filename);

var s = require("lib/datamodel/structures");
var RegisterServerRequest  = require("lib/services/register_server_service").RegisterServerRequest;
var RegisterServerResponse = require("lib/services/register_server_service").RegisterServerResponse;
var FindServersRequest = require("lib/services/register_server_service").FindServersRequest;
var FindServersResponse = require("lib/services/register_server_service").FindServersResponse;

// add the tcp/ip endpoint with no security

var OPCUADiscoveryServer =  require("lib/server/opcua_discovery_server").OPCUADiscoveryServer;

var perform_findServersRequest = require("lib/findservers").perform_findServersRequest;


describe("Discovery server",function(){

    var discovery_server,discovery_server_endpointUrl;

    beforeEach(function(done){
        discovery_server = new OPCUADiscoveryServer({ port: 1235 });
        discovery_server_endpointUrl = discovery_server._get_endpoints()[0].endpointUrl;
        discovery_server.start(done);
    });
    afterEach(function(done){

        discovery_server.shutdown(done);
    });

    var server = new OPCUAServer({ port: 1235 });
    server.serverType = s.ApplicationType.SERVER;



    it("should register server to the discover server",function(done){

        // there should be no endpoint exposed by an blank discovery server
        discovery_server.registered_servers.length.should.equal(0);

        server.registerServer(discovery_server_endpointUrl,function(err){

            discovery_server.registered_servers.length.should.not.equal(0);

            perform_findServersRequest(discovery_server_endpointUrl,function(err,servers){
                console.log(servers);
                done(err);
            });
            // now check that find server
            //done(err);
        });

    });



});

