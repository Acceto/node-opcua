/*global Buffer*/
/**
 * @module opcua.server
 */

require("requirish")._(module);
var s = require("lib/datamodel/structures");
var ApplicationType = s.ApplicationType;

var StatusCodes = require("lib/datamodel/opcua_status_code").StatusCodes;
var assert = require("better-assert");

var async = require("async");
var util = require("util");
var path = require("path");
var fs = require("fs");

var debugLog = require("lib/misc/utils").make_debugLog(__filename);

var ServerEngine = require("lib/server/server_engine").ServerEngine;
var LocalizedText =require("lib/datamodel/localized_text").LocalizedText;

var browse_service = require("lib/services/browse_service");
var read_service = require("lib/services/read_service");
var write_service = require("lib/services/write_service");
var subscription_service = require("lib/services/subscription_service");
var register_server_service =require("lib/services/register_server_service");
var translate_service = require("lib/services/translate_browse_paths_to_node_ids_service");
var session_service = require("lib/services/session_service");
var call_service = require("lib/services/call_service");
var endpoints_service = require("lib/services/get_endpoints_service");

var TimestampsToReturn = read_service.TimestampsToReturn;

var ActivateSessionRequest  = session_service.ActivateSessionRequest;
var ActivateSessionResponse = session_service.ActivateSessionResponse;

var CreateSessionRequest    = session_service.CreateSessionRequest;
var CreateSessionResponse   = session_service.CreateSessionResponse;

var CloseSessionRequest     = session_service.CloseSessionRequest;
var CloseSessionResponse    = session_service.CloseSessionResponse;

var DeleteMonitoredItemsRequest  = subscription_service.DeleteMonitoredItemsRequest;
var DeleteMonitoredItemsResponse = subscription_service.DeleteMonitoredItemsResponse;

var RepublishRequest             = subscription_service.RepublishRequest;
var RepublishResponse            = subscription_service.RepublishResponse;

var PublishRequest               = subscription_service.PublishRequest;
var PublishResponse              = subscription_service.PublishResponse;

var CreateSubscriptionRequest    = subscription_service.CreateSubscriptionRequest;
var CreateSubscriptionResponse   = subscription_service.CreateSubscriptionResponse;

var DeleteSubscriptionsRequest   = subscription_service.DeleteSubscriptionsRequest;
var DeleteSubscriptionsResponse  = subscription_service.DeleteSubscriptionsResponse;

var CreateMonitoredItemsRequest  = subscription_service.CreateMonitoredItemsRequest;
var CreateMonitoredItemsResponse = subscription_service.CreateMonitoredItemsResponse;
var MonitoredItemCreateResult    = subscription_service.MonitoredItemCreateResult;
var SetPublishingModeRequest     = subscription_service.SetPublishingModeRequest;
var SetPublishingModeResponse    = subscription_service.SetPublishingModeResponse;

var CallRequest  = call_service.CallRequest;
var CallResponse = call_service.CallResponse;

var ReadRequest = read_service.ReadRequest;
var ReadResponse = read_service.ReadResponse;

var WriteRequest = write_service.WriteRequest;
var WriteResponse = write_service.WriteResponse;

var ReadValueId = read_service.ReadValueId;

var BrowseResponse = browse_service.BrowseResponse;
var BrowseRequest = browse_service.BrowseRequest;

var TranslateBrowsePathsToNodeIdsRequest  = translate_service.TranslateBrowsePathsToNodeIdsRequest;
var TranslateBrowsePathsToNodeIdsResponse = translate_service.TranslateBrowsePathsToNodeIdsResponse;

var RegisterServerRequest = register_server_service.RegisterServerRequest;
var RegisterServerResponse = register_server_service.RegisterServerResponse;


var _ = require("underscore");
var NodeId = require("lib/datamodel/nodeid").NodeId;
var NodeIdType = require("lib/datamodel/nodeid").NodeIdType;
var DataValue = require("lib/datamodel/datavalue").DataValue;
var DataType = require("lib/datamodel/variant").DataType;
var AttributeIds = require("lib/datamodel/attributeIds").AttributeIds;
var SignatureData = require("lib/datamodel/structures").SignatureData;

var MonitoredItem = require("lib/server/monitored_item").MonitoredItem;

var crypto = require("crypto");
var crypto_utils = require("lib/misc/crypto_utils");

var dump = require("lib/misc/utils").dump;

var OPCUAServerEndPoint = require("lib/server/server_end_point").OPCUAServerEndPoint;

var OPCUABaseServer = require("lib/server/base_server").OPCUABaseServer;

var Factory = function Factory(engine) {
    assert(_.isObject(engine));
    this.engine = engine;
};

var factories = require("lib/misc/factories");

Factory.prototype.constructObject = function(id) {
    return factories.constructObject(id);
};

var default_maxAllowedSessionNumber = 10;


var default_server_info  ={
    applicationUri: "urn:NodeOPCUA-Server",
    productUri: "SampleServer",
    applicationName: {text: "SampleServer", locale: null},
    applicationType: ApplicationType.SERVER,
    gatewayServerUri: "",
    discoveryProfileUri: "",
    discoveryUrls: []
};
var package_json_file = path.join(__dirname,"../../package.json");

var default_build_info = {
    productName: "NODEOPCUA-SERVER",
    productUri: null, // << should be same as default_server_info.productUri?
    manufacturerName: "Node-OPCUA : MIT Licence ( see http://node-opcua.github.io/)",
    softwareVersion:  require(package_json_file).version,
    buildDate: fs.statSync(package_json_file).mtime
};


/**
 * @class OPCUAServer
 * @extends  OPCUABaseServer
 * @uses ServerEngine
 * @param options
 * @param [options.defaultSecureTokenLifetime = 60000] {Number} the default secure token life time in ms.
 * @param [options.timeout=10000] {Number}              the HEL/ACK transaction timeout in ms. Use a large value
 *                                                      ( i.e 15000 ms) for slow connections or embedded devices.
 * @param [options.port= 26543] {Number}                the TCP port to listen to.
 * @param [options.maxAllowedSessionNumber = 10 ]       the maximum number of concurrent sessions allowed.
 *
 * @param [options.nodeset_filename]{Array<String>|String} the nodeset.xml files to load
 * @param [options.serverInfo = null]                   the information used in the end point description
 * @param [options.serverInfo.applicationUri = "urn:NodeOPCUA-SimpleDemoServer"] {String}
 * @param [options.serverInfo.productUri = "SimpleDemoServer"]{String}
 * @param [options.serverInfo.applicationName = {text: "applicationName"}]{LocalizedText}
 * @param [options.serverInfo.gatewayServerUri = null]{String}
 * @param [options.serverInfo.discoveryProfileUri= null]{String}
 * @param [options.serverInfo.discoveryUrls = []]{Array<String>}
 * @constructor
 */
function OPCUAServer(options) {

    options = options || {};

    OPCUABaseServer.apply(this, arguments);

    var self = this;

    self.options = options;

    self.serverInfo = _.clone(default_server_info);
    self.serverInfo = _.extend(self.serverInfo,options.serverInfo);

    self.serverInfo.applicationName = new LocalizedText(self.serverInfo.applicationName);

    // build Info
    var buildInfo = _.clone(default_build_info);
    buildInfo = _.extend(buildInfo,options.buildInfo);

    // repair product name
    buildInfo.productUri = buildInfo.productUri  || self.serverInfo.productUri;
    self.serverInfo.productUri = self.serverInfo.productUri || buildInfo.productUri;

    self.engine = new ServerEngine({buildInfo: buildInfo});

    self.nonce = crypto.randomBytes(32);

    self.protocolVersion = 0;

    var port = options.port || 26543;
    assert(_.isFinite(port));

    self.objectFactory = new Factory(self.engine);

    // todo  should self.serverInfo.productUri  match self.engine.buildInfo.productUri ?

    // add the tcp/ip endpoint with no security
    var endPoint = new OPCUAServerEndPoint({
        port: port,
        defaultSecureTokenLifetime: options.defaultSecureTokenLifetime || 60000,
        timeout: options.timeout || 10000,
        certificate:self.getCertificate(),
        privateKey: self.getPrivateKey(),
        objectFactory: self.objectFactory,
        serverInfo: self.serverInfo
    });
    endPoint.addStandardEndpointDescription();

    self.endpoints.push(endPoint);

    endPoint.on("message", function (message, channel) {
        self.on_request(message, channel);
    });

    endPoint.on("error", function (err) {
        console.log("OPCUAServer endpoint error", err);
        self.shutdown(function () {
        });
    });

    self.serverType = ApplicationType.SERVER;

    self.maxAllowedSessionNumber = options.maxAllowedSessionNumber || default_maxAllowedSessionNumber;
}
util.inherits(OPCUAServer, OPCUABaseServer);

/**
 * The type of server : SERVER, CLIENTANDSERVER, DISCOVERYSERVER
 * @property serverType
 * @type {ApplicationType}
 */
OPCUAServer.prototype.__defineGetter__("serverType",function() {
    return  this.serverInfo.applicationType;
});

/**
 * total number of bytes written  by the server since startup
 * @property bytesWritten
 * @type {Number}
 */
OPCUAServer.prototype.__defineGetter__("bytesWritten",function() {

    return this.endpoints.reduce(function(accumulated,endpoint) { return accumulated + endpoint.bytesWritten},0);
});

/**
 * total number of bytes read  by the server since startup
 * @property bytesRead
 * @type {Number}
 */
OPCUAServer.prototype.__defineGetter__("bytesRead",function() {
    return  this.endpoints.reduce(function(accumulated,endpoint) { return accumulated + endpoint.bytesRead},0);
});

/**
 * Number of transactions processed by the server since startup
 * @property transactionsCount
 * @type {Number}
 */
OPCUAServer.prototype.__defineGetter__("transactionsCount",function() {
    return  this.endpoints.reduce(function(accumulated,endpoint) { return accumulated + endpoint.transactionsCount},0);
});


/**
 * The server build info
 * @property buildInfo
 * @type {BuildInfo}
 */
OPCUAServer.prototype.__defineGetter__("buildInfo", function () {
    return this.engine.buildInfo;
});

/**
 * the number of connected channel on all existing end points
 * @property currentChannelCount
 * @type  {Number}
 *
 * TODO : move to base
 */
OPCUAServer.prototype.__defineGetter__("currentChannelCount", function () {

    var self = this;
    return  self.endpoints.reduce(function (currentValue, endPoint) {
        return currentValue + endPoint.currentChannelCount;
    }, 0);
});


/**
 * The number of active subscriptions from all sessions
 * @property currentSubscriptionCount
 * @type {Number}
 */
OPCUAServer.prototype.__defineGetter__("currentSubscriptionCount", function () {
    var self = this;
    return self.engine.currentSubscriptionCount;
});

OPCUAServer.prototype.__defineGetter__("rejectedSessionCount",        function () { return this.engine.rejectedSessionCount;});
OPCUAServer.prototype.__defineGetter__("rejectedRequestsCount",       function () { return this.engine.rejectedRequestsCount;});
OPCUAServer.prototype.__defineGetter__("sessionAbortCount",           function () { return this.engine.sessionAbortCount;});
OPCUAServer.prototype.__defineGetter__("publishingIntervalCount",     function () { return this.engine.publishingIntervalCount;});

/**
 * create and register a new session
 * @method createSession
 * @return {ServerSession}
 */
OPCUAServer.prototype.createSession = function (options) {
    var self = this;
    return self.engine.createSession(options);
};

/**
 * the number of sessions currently active
 * @property currentSessionCount
 * @type {Number}
 */
OPCUAServer.prototype.__defineGetter__("currentSessionCount", function () {
    return this.engine.currentSessionCount;
});

/**
 * retrieve a session by authentication token
 * @method getSession
 *
 * @param authenticationToken
 */
OPCUAServer.prototype.getSession = function (authenticationToken) {
    var self = this;
    return self.engine.getSession(authenticationToken);
};

/**
 * true if the server has been initialized
 * @property initialized
 * @type {Boolean}
 *
 */
OPCUAServer.prototype.__defineGetter__("initialized", function () {
    var self = this;
    return self.engine.address_space !== null;
});


/**
 * Initialize the server by installing default node set.
 *
 * @method initialize
 * @async
 *
 * This is a asynchronous function that requires a callback function.
 * The callback function typically completes the creation of custom node
 * and instruct the server to listen to its endpoints.
 *
 * @param {Function} done
 */
OPCUAServer.prototype.initialize = function (done) {

    var self = this;
    assert(!self.initialized);// already initialized ?
    self.engine.initialize(self.options, function () {
        self.emit("post_initialize");
        done();
    });
};


/**
 * Initiate the server by starting all its endpoints
 * @method start
 * @async
 * @param done {Function}
 */
OPCUAServer.prototype.start = function (done) {

    var self = this;
    var tasks = [];
    if (!self.initialized) {
        tasks.push(function (callback) {
            self.initialize(callback);
        });
    }
    tasks.push(function (callback) {
        OPCUABaseServer.prototype.start.call(self, callback);
    });

    async.series(tasks, done);

};

/**
 * shutdown all server endpoints
 * @method shutdown
 * @async
 * @param  done {Function}
 */
OPCUAServer.prototype.shutdown = function (done) {

    var self = this;
    self.engine.shutdown();

    OPCUABaseServer.prototype.shutdown.call(self, done);

};


OPCUAServer.prototype.computeServerSignature = function (channel, clientCertificate, clientNonce) {

    if (!clientNonce || !clientCertificate) {
        return null;
    }
    // This parameter is calculated by appending the clientNonce to the clientCertificate
    var buffer = Buffer.concat([clientCertificate, clientNonce]);

    // ... and signing the resulting sequence of bytes.
    var signature = channel.sign(buffer);

    return new SignatureData({
        // This is a signature generated with the private key associated with a Certificate
        signature: signature,
        // A string containing the URI of the algorithm.
        // The URI string values are defined as part of the security profiles specified in Part 7.
        algorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1"
    });

    // The SignatureAlgorithm shall be the AsymmetricSignatureAlgorithm specified in the
    // SecurityPolicy for the Endpoint

};


var minSessionTimeout     = 10; // 10 milliseconds
var defaultSessionTimeout = 1000; // 1 second
var maxSessionTimeout     = 1000 * 60 * 5; // 5 minute

// session services
OPCUAServer.prototype._on_CreateSessionRequest = function (message, channel) {

    var server = this;
    var request = message.request;
    var response;

    assert(request instanceof CreateSessionRequest);


    // check if session count hasn't reach the maximum allowed sessions
    if (server.currentSessionCount >= server.maxAllowedSessionNumber) {

        server.engine._rejectedSessionCount += 1;

        response = new CreateSessionResponse({ responseHeader: { serviceResult: StatusCodes.BadTooManySessions   } });
        return channel.send_response("MSG", response, message);
    }

    // Duration Requested maximum number of milliseconds that a Session should remain open without activity.
    // If the Client fails to issue a Service request within this interval, then the Server shall automatically
    // terminate the Client Session.
    var revisedSessionTimeout = request.requestedSessionTimeout || defaultSessionTimeout;
    revisedSessionTimeout = Math.min(revisedSessionTimeout,maxSessionTimeout);
    revisedSessionTimeout = Math.max(revisedSessionTimeout,minSessionTimeout);
    //xx console.log("xxxxx requested time out = ",request.requestedSessionTimeout," revised= ",revisedSessionTimeout);

    // Release 1.02 page 27 OPC Unified Architecture, Part 4: CreateSession.clientNonce
    // A random number that should never be used in any other request. This number shall have a minimum length of 32
    // bytes. Profiles may increase the required length. The Server shall use this value to prove possession of
    // its application instance Certificate in the response.
    if (!request.clientNonce ||  request.clientNonce.length<32) {
        if (channel.securityMode !== endpoints_service.MessageSecurityMode.NONE) {
            console.log("SERVER with secure connection: Missing or invalid client Nonce ".red,request.clientNonce && request.clientNonce.toString("hex"));

            server.engine._rejectedSessionCount += 1;

            response = new CreateSessionResponse({ responseHeader: { serviceResult: StatusCodes.BadNonceInvalid   } });
            return channel.send_response("MSG", response, message);
        }
    }


    // see Release 1.02  27  OPC Unified Architecture, Part 4

    var session = server.createSession({sessionTimeout:revisedSessionTimeout});
    assert(session);
    // Depending upon on the  SecurityPolicy  and the  SecurityMode  of the  SecureChannel,  the exchange of
    // ApplicationInstanceCertificates   and  Nonces  may be optional and the signatures may be empty. See
    // Part  7  for the definition of  SecurityPolicies  and the handling of these parameters


    // serverNonce:
    // A random number that should never be used in any other request.
    // This number shall have a minimum length of 32 bytes.
    // The Client shall use this value to prove possession of its application instance
    // Certificate in the ActivateSession request.
    // This value may also be used to prove possession of the userIdentityToken it
    // specified in the ActivateSession request.
    //
    // ( this serverNonce will only be used up to the _on_ActivateSessionRequest
    //   where a new nonce will be created)
    session.nonce = crypto.randomBytes(32);


    response = new CreateSessionResponse({
        // A identifier which uniquely identifies the session.
        sessionId: session.nodeId,

        // A unique identifier assigned by the Server to the Session.
        // The token used to authenticate the client in subsequent requests.
        authenticationToken: session.authenticationToken,

        revisedSessionTimeout: revisedSessionTimeout,

        serverNonce: session.nonce,

        // serverCertificate: type ApplicationServerCertificate
        // The application instance Certificate issued to the Server.
        // A Server shall prove possession by using the private key to sign the Nonce provided
        // by the Client in the request. The Client shall verify that this Certificate is the same as
        // the one it used to create the SecureChannel.
        // The ApplicationInstanceCertificate type is defined in 7.2.
        // If the securityPolicyUri is NONE and none of the UserTokenPolicies requires
        // encryption, the Server shall not send an ApplicationInstanceCertificate and the Client
        // shall ignore the ApplicationInstanceCertificate.
        serverCertificate: server.getCertificate(),

        // The endpoints provided by the server.
        // The Server shall return a set of EndpointDescriptions available for the serverUri
        // specified in the request.[...]
        // The Client shall verify this list with the list from a Discovery Endpoint if it used a Discovery
        // Endpoint to fetch the EndpointDescriptions.
        // It is recommended that Servers only include the endpointUrl, securityMode,
        // securityPolicyUri, userIdentityTokens, transportProfileUri and securityLevel with all
        // other parameters set to null. Only the recommended parameters shall be verified by
        // the client.
        serverEndpoints: server._get_endpoints(),

        //This parameter is deprecated and the array shall be empty.
        serverSoftwareCertificates: null,

        // This is a signature generated with the private key associated with the
        // serverCertificate. This parameter is calculated by appending the clientNonce to the
        // clientCertificate and signing the resulting sequence of bytes.
        // The SignatureAlgorithm shall be the AsymmetricSignatureAlgorithm specified in the
        // SecurityPolicy for the Endpoint.
        // The SignatureData type is defined in 7.30.
        serverSignature: server.computeServerSignature(channel, request.clientCertificate, request.clientNonce),


        // The maximum message size accepted by the server
        // The Client Communication Stack should return a Bad_RequestTooLarge error to the
        // application if a request message exceeds this limit.
        // The value zero indicates that this parameter is not used.
        maxRequestMessageSize: 0x4000000

    });

    assert(response.authenticationToken);
    channel.send_response("MSG", response, message);
};


// TODO : implement this:
//
// When the ActivateSession Service is called for the first time then the Server shall reject the request
// if the SecureChannel is not same as the one associated with the CreateSession request.
// Subsequent calls to ActivateSession may be associated with different SecureChannels. If this is the
// case then the Server shall verify that the Certificate the Client used to create the new
// SecureChannel is the same as the Certificate used to create the original SecureChannel. In addition,
// the Server shall verify that the Client supplied a UserIdentityToken that is identical to the token
// currently associated with the Session. Once the Server accepts the new SecureChannel it shall
// reject requests sent via the old SecureChannel.


/**
 *
 * @method _on_ActivateSessionRequest
 * @param message {Buffer}
 * @param channel {ServerSecureChannelLayer}
 * @private
 *
 *
 */
OPCUAServer.prototype._on_ActivateSessionRequest = function (message, channel) {

    var server = this;
    var request = message.request;
    assert(request instanceof ActivateSessionRequest);

    // get session from authenticationToken
    var authenticationToken = request.requestHeader.authenticationToken;

    var session = server.getSession(authenticationToken);

    var response;
    if (!session) {
        console.log(" Bad Session in  _on_ActivateSessionRequest".yellow.bold, authenticationToken.value.toString("hex"));
        //xx response = new s.ServiceFault({

        server.engine._rejectedSessionCount += 1;
        response = new ActivateSessionResponse({responseHeader: {serviceResult: StatusCodes.BadSessionNotActivated}});

    } else {

        //xx console.log("XXXXXXX _on_ActivateSessionRequest NONCE ",session.nonce.toString("hex").cyan);

        // extract : OPC UA part 4 - 5.6.3

        // Once used, a serverNonce cannot be used again. For that reason, the Server returns a new
        // serverNonce each time the ActivateSession Service is called.
        session.nonce = crypto.randomBytes(32);

        response = new ActivateSessionResponse({serverNonce: session.nonce});
    }
    channel.send_response("MSG", response, message);
};


/**
 * ensure that action is performed on a valid session object,
 * @method _apply_on_SessionObject
 * @private
 */
OPCUAServer.prototype._apply_on_SessionObject = function (ResponseClass,message, channel, action_to_perform) {

    assert(_.isFunction(action_to_perform));

    if (!message.session) {

        console.log("XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX".red);
        console.log("XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX".red);

        var errMessage = "INVALID SESSION  !! ";
        debugLog(errMessage.red.bold);

        var response = new ResponseClass({
            responseHeader: {serviceResult: StatusCodes.BadSessionNotActivated}
        });
        //xx var response = OPCUABaseServer.makeServiceFault(StatusCodes.BadSessionNotActivated,[errMessage]);
        channel.send_response("MSG", response, message);
        return;
    }

    // lets also reset the session watchdog so it doesn't
    // (Sessions are terminated by the Server automatically if the Client fails to issue a Service request on the Session
    // within the timeout period negotiated by the Server in the CreateSession Service response. )
    assert(_.isFunction(message.session.keepAlive));
    message.session.keepAlive();

    action_to_perform(message.session, message, channel);

};

/**
 * @method _on_CloseSessionRequest
 * @param message
 * @param channel
 * @private
 */
OPCUAServer.prototype._on_CloseSessionRequest = function (message, channel) {

    var server = this;

    var request = message.request;
    assert(request instanceof CloseSessionRequest);
    assert(request.hasOwnProperty("deleteSubscriptions"));

    this._apply_on_SessionObject(CloseSessionResponse,message, channel, function (session) {

        assert(session!==null);

        var deleteSubscriptions = request.deleteSubscriptions || false;

        server.engine.closeSession(request.requestHeader.authenticationToken, deleteSubscriptions);

        var response = new CloseSessionResponse({});
        channel.send_response("MSG", response, message);
    });


};

// browse services
OPCUAServer.prototype._on_BrowseRequest = function (message, channel) {

    var server = this;

    var request = message.request;
    assert(request instanceof BrowseRequest);

    var results = [];
    if (request.nodesToBrowse.length > 0) {

        assert(request.nodesToBrowse[0]._schema.name === "BrowseDescription");
        results = server.engine.browse(request.nodesToBrowse);
        assert(results[0]._schema.name == "BrowseResult");

    }

    var response = new BrowseResponse({
        results: results,
        diagnosticInfos: null
    });
    channel.send_response("MSG", response, message);
};


// read services
OPCUAServer.prototype._on_ReadRequest = function (message, channel) {

    var server = this;

    var request = message.request;
    assert(request instanceof ReadRequest);

    var results = [];
    var response;

    var timestampsToReturn = request.timestampsToReturn;

    if (timestampsToReturn === TimestampsToReturn.Invalid) {
        response = new ReadResponse({
                responseHeader: {serviceResult: StatusCodes.BadTimestampsToReturnInvalid}
        });
        channel.send_response("MSG", response, message);
        return;

    }

    if (request.maxAge < 0) {
        response = new ReadResponse({
            responseHeader: {serviceResult: StatusCodes.BadMaxAgeInvalid}
        });
        channel.send_response("MSG", response, message);
        return;
    }

    if (request.nodesToRead.length <= 0) {
        // ! BadNothingToDo
        response = new ReadResponse({
            responseHeader: {serviceResult: StatusCodes.BadNothingToDo}
        });
        channel.send_response("MSG", response, message);
        return;

    }
    assert(request.nodesToRead[0]._schema.name === "ReadValueId");
    assert(request.timestampsToReturn);

    // ask for a refresh of asynchronous variables
    server.engine.refreshValues(request.nodesToRead,function(err,data){

        assert(!err, " error not handled here , fix me");

        results = server.engine.read(request);

        assert(results[0]._schema.name === "DataValue");
        assert(results.length === request.nodesToRead.length);

        response = new ReadResponse({
            results: results,
            diagnosticInfos: null
        });

        channel.send_response("MSG", response, message);


    });

};

// write services
OPCUAServer.prototype._on_WriteRequest = function (message, channel) {

    var server = this;

    var request = message.request;
    assert(request instanceof WriteRequest);
    assert(_.isArray(request.nodesToWrite));

    var results = [];

    if (request.nodesToWrite.length > 0) {

        assert(request.nodesToWrite[0]._schema.name === "WriteValue");
        results = server.engine.write(request.nodesToWrite);
        assert(_.isArray(results));
        assert(results.length === request.nodesToWrite.length);

    }

    var response = new WriteResponse({
        results: results,
        diagnosticInfos: null
    });
    channel.send_response("MSG", response, message);
};



// subscription services
OPCUAServer.prototype._on_CreateSubscriptionRequest = function (message, channel) {

    var server = this;

    assert(message.request instanceof CreateSubscriptionRequest);

    this._apply_on_SessionObject(CreateSubscriptionResponse,message, channel, function (session) {

        var request = message.request;
        assert(_.isFinite(request.requestedPublishingInterval));

        var subscription = session.createSubscription(request);

        var response = new CreateSubscriptionResponse({
            subscriptionId: subscription.id,
            revisedPublishingInterval: subscription.publishingInterval,
            revisedLifetimeCount: subscription.maxLifeTimeCount,
            revisedMaxKeepAliveCount: subscription.maxKeepAliveCount
        });
        channel.send_response("MSG", response, message);
    });
};

OPCUAServer.prototype._on_DeleteSubscriptionsRequest = function (message, channel) {

    var request = message.request;
    assert(request instanceof DeleteSubscriptionsRequest);

    this._apply_on_SessionObject(DeleteSubscriptionsResponse,message, channel, function (session) {

        var results = request.subscriptionIds.map(function (subscriptionId) {
            return session.deleteSubscription(subscriptionId);
        });
        var response = new DeleteSubscriptionsResponse({
            results: results
        });
        channel.send_response("MSG", response, message);
    });
};

function are_same_values(v1,v2) {
    if (!v1 || !v2) { return !v1 && !v2; }
    if (!v1.value || !v2.value) { return !v1.value && !v2.value; }
    return _.isEqual(v1,v2);
};

/**
 *
 * perform the read operation on a given node for a monitored item.
 *
 * @param self
 * @param oldValue
 * @param node
 * @param itemToMonitor
 * @private
 */
function monitoredItem_read_and_record_value(self,oldValue,node, itemToMonitor) {

    assert(self instanceof MonitoredItem);

    var dataValue = node.readAttribute(itemToMonitor.attributeId);

    if (dataValue.statusCode === StatusCodes.Good) {
        if (!are_same_values(dataValue, oldValue)) {
            self.recordValue(dataValue);
        }
    } else {

        debugLog("readValue2 Error" + dataValue.statusCode.toString());
    }
}

function monitoredItem_read_and_record_value_async(self, oldValue, node, itemToMonitor) {
    // do it asynchronously
    node.readValueAsync(function(err){

        monitoredItem_read_and_record_value(self, oldValue, node, itemToMonitor);
    });
}


function build_scanning_node_function(engine, itemToMonitor) {

    assert(itemToMonitor instanceof ReadValueId);
    assert(engine.status === "initialized" && "engine must be initialized");

    var node = engine.findObject(itemToMonitor.nodeId);

    if (!node) {

        console.log(" INVALID NODE ID  , ", itemToMonitor.nodeId.toString());
        dump(itemToMonitor);
        return function () {
            return new DataValue({
                statusCode: StatusCodes.BadNodeIdUnknown,
                value: {dataType: DataType.Null, value: 0}
            });
        };
    }

    var monitoredItem_read_and_record_value_func = (itemToMonitor.attributeId === AttributeIds.Value && _.isFunction(node.readValueAsync))
                    ? monitoredItem_read_and_record_value_async
                    : monitoredItem_read_and_record_value ;

    return function (oldDataValue) {
        assert(this instanceof MonitoredItem);
        return monitoredItem_read_and_record_value_func(this, oldDataValue, node, itemToMonitor);
    }

}

OPCUAServer.prototype.prepare = function (message) {

    var server = this;
    var request = message.request;

    // --- check that session is correct
    var authenticationToken = request.requestHeader.authenticationToken;
    var session = server.getSession(authenticationToken);

    message.session = session;

};

OPCUAServer.prototype.__findMonitoredItem = function(nodeId){
    var engine = this.engine;
    if (!engine) { return null; }
    return engine.findObject(nodeId);
};

OPCUAServer.prototype._on_CreateMonitoredItemsRequest = function (message, channel) {

    var server = this;
    var engine = server.engine;
    var request = message.request;
    assert(request instanceof CreateMonitoredItemsRequest);

    this._apply_on_SessionObject(CreateMonitoredItemsResponse,message, channel, function (session) {

        var subscription = session.getSubscription(request.subscriptionId);
        var response;
        if (!subscription) {
            response = new CreateMonitoredItemsResponse({
                responseHeader: {serviceResult: StatusCodes.BadSubscriptionIdInvalid}
            });

        } else {

            var timestampsToReturn = request.timestampsToReturn;

            if (timestampsToReturn == TimestampsToReturn.Invalid) {
                response = new CreateMonitoredItemsResponse({
                    responseHeader: {serviceResult: StatusCodes.BadTimestampsToReturnInvalid}
                });

            } else {

                var results = request.itemsToCreate.map(function (monitoredItemCreateRequest) {

                    var itemToMonitor = monitoredItemCreateRequest.itemToMonitor;

                    var node  = server.__findMonitoredItem(itemToMonitor.nodeId);
                    if (!node) {
                        // BadNodeIdInvalid
                        return new MonitoredItemCreateResult({statusCode: StatusCodes.BadNodeIdUnknown});
                    }

                    //xx var monitoringMode      = monitoredItemCreateRequest.monitoringMode; // Disabled, Sampling, Reporting
                    //xx var requestedParameters = monitoredItemCreateRequest.requestedParameters;

                    var monitoredItemCreateResult = subscription.createMonitoredItem(timestampsToReturn, monitoredItemCreateRequest,node);

                    var monitoredItem = subscription.getMonitoredItem(monitoredItemCreateResult.monitoredItemId);

                    var readNodeFunc = build_scanning_node_function(engine, itemToMonitor);

                    monitoredItem.on("samplingEvent", readNodeFunc);
                    return monitoredItemCreateResult;
                });

                response = new CreateMonitoredItemsResponse({
                    responseHeader:  {serviceResult: StatusCodes.Good},
                    results: results
                    //,diagnosticInfos: []
                });
            }

        }
        channel.send_response("MSG", response, message);

    });

};



OPCUAServer.prototype._on_PublishRequest = function (message, channel) {

    var request = message.request;
    assert(request instanceof PublishRequest);

    this._apply_on_SessionObject(PublishResponse,message, channel, function (session) {
        assert(session);
        assert(session.publishEngine); // server.publishEngine doesn't exists, OPCUAServer has probably shut down already
        session.publishEngine._on_PublishRequest(request,  function (request, response) {
            channel.send_response("MSG", response, message);
        });
    });
};


OPCUAServer.prototype._on_SetPublishingModeRequest = function (message, channel) {

    var request = message.request;
    assert(request instanceof SetPublishingModeRequest);

    this._apply_on_SessionObject(SetPublishingModeResponse,message, channel, function (session) {

        var response = new SetPublishingModeResponse({
            results: [],
            diagnosticInfos: null
        });
        // todo : implement

        channel.send_response("MSG", response, message);
    });
};


OPCUAServer.prototype._on_DeleteMonitoredItemsRequest = function (message, channel) {

    var request = message.request;
    assert(request instanceof DeleteMonitoredItemsRequest);

    this._apply_on_SessionObject(DeleteMonitoredItemsResponse,message, channel, function (session) {

        var subscriptionId = request.subscriptionId;
        assert(subscriptionId !== null);

        var subscription = session.getSubscription(subscriptionId);
        var response;
        if (!subscription) {
            console.log("Cannot find subscription ", subscriptionId);
            response = new DeleteMonitoredItemsResponse({
                responseHeader: {serviceResult: StatusCodes.BadSubscriptionIdInvalid}
            });
        } else {

            var results = request.monitoredItemIds.map(function (monitoredItemId) {
                return subscription.removeMonitoredItem(monitoredItemId);
            });

            response = new DeleteMonitoredItemsResponse({
                results: results,
                diagnosticInfos: null
            });
        }
        channel.send_response("MSG", response, message);
    });
};

OPCUAServer.prototype._on_RepublishRequest = function (message, channel) {

    var request = message.request;
    assert(request instanceof RepublishRequest);

    this._apply_on_SessionObject(RepublishResponse,message, channel, function (session) {

        var response;

        var subscription = session.getSubscription(request.subscriptionId);

        if (!subscription) {
            response = new RepublishResponse({
                responseHeader: {
                    serviceResult: StatusCodes.BadSubscriptionIdInvalid
                }
            });

        } else {
            response = new RepublishResponse({
                responseHeader: {
                    serviceResult: StatusCodes.BadMessageNotAvailable
                },
                notificationMessage: {}
            });
        }
        channel.send_response("MSG", response, message);
    });
};

var SetMonitoringModeRequest = subscription_service.SetMonitoringModeRequest;
var SetMonitoringModeResponse = subscription_service.SetMonitoringModeResponse;

// Bad_NothingToDo
// Bad_TooManyOperations
// Bad_SubscriptionIdInvalid
// Bad_MonitoringModeInvalid
OPCUAServer.prototype._on_SetMonitoringModeRequest = function (message, channel) {

    var request = message.request;
    assert(request instanceof SetMonitoringModeRequest);

    var response;

    this._apply_on_SessionObject(RepublishResponse,message, channel, function (session) {

        var subscription = session.getSubscription(request.subscriptionId);

        if (!subscription) {
            response = new SetMonitoringModeResponse({
                responseHeader: { serviceResult: StatusCodes.BadSubscriptionIdInvalid }
            });
            return channel.send_response("MSG", response, message);
        }
        if (request.monitoredItemIds.length === 0 ) {
            response = new SetMonitoringModeResponse({
                responseHeader: { serviceResult: StatusCodes.BadNothingToDo }
            });
            return channel.send_response("MSG", response, message);
        }

        var monitoringMode = request.monitoringMode;

        if( monitoringMode === subscription_service.MonitoringMode.Invalid) {
            response = new SetMonitoringModeResponse({
                responseHeader: { serviceResult: StatusCodes.BadMonitoringModeInvalid }
            });
            return channel.send_response("MSG", response, message);
        }

        var results = request.monitoredItemIds.map(function(monitoredItemId) {

            var monitoredItem = subscription.getMonitoredItem(monitoredItemId);
            if (!monitoredItem) {
                return StatusCode.BadMonitoredItemIdInvalid;
            }
            monitoredItem.setMonitoringMode(monitoringMode);
            return StatusCodes.Good;
        });

        response = new SetMonitoringModeResponse({
            results: results
        });
        channel.send_response("MSG", response, message);
    });

};

// _on_TranslateBrowsePathsToNodeIds service
OPCUAServer.prototype._on_TranslateBrowsePathsToNodeIdsRequest = function (message, channel) {

    var server = this;

    var request = message.request;
    assert(request instanceof TranslateBrowsePathsToNodeIdsRequest);

    var browsePathResults = request.browsePath.map(function (browsePath) {
        return server.engine.browsePath(browsePath);
    });
    var response = new TranslateBrowsePathsToNodeIdsResponse({
        results: browsePathResults,
        diagnosticInfos: null
    });
    channel.send_response("MSG", response, message);
};



// Symbolic Id                   Description
//----------------------------  ----------------------------------------------------------------------------------------
// Bad_NodeIdInvalid             Used to indicate that the specified object is not valid.
//
// Bad_NodeIdUnknown             Used to indicate that the specified object is not valid.
//
// Bad_ArgumentsMissing          The client did not specify all of the input arguments for the method.
// Bad_UserAccessDenied
//
// Bad_MethodInvalid             The method id does not refer to a method for the specified object.
// Bad_OutOfRange                Used to indicate that an input argument is outside the acceptable range.
// Bad_TypeMismatch              Used to indicate that an input argument does not have the correct data type.
//                               A ByteString is structurally the same as a one dimensional array of Byte.
//                               A server shall accept a ByteString if an array of Byte is expected.
// Bad_NoCommunication

var getMethodDeclaration_ArgumentList = require("lib/datamodel/argument_list").getMethodDeclaration_ArgumentList;
var verifyArguments_ArgumentList = require("lib/datamodel/argument_list").verifyArguments_ArgumentList;

function callMethod(session,callMethodRequest,callback) {

    var server = this;
    var address_space = server.engine.address_space;

    var objectId = callMethodRequest.objectId;
    var methodId = callMethodRequest.methodId;
    var inputArguments = callMethodRequest.inputArguments;

    assert(objectId instanceof NodeId);
    assert(methodId instanceof NodeId);


    var response = getMethodDeclaration_ArgumentList(address_space,objectId,methodId);

    if (response.statusCode != StatusCodes.Good) {
        return callback(null,{ statusCode: response.statusCode} );
    }
    var methodDeclaration = response.methodDeclaration;

    // verify input Parameters
    var methodInputArguments = methodDeclaration.getInputArguments();

    response  = verifyArguments_ArgumentList(methodInputArguments,inputArguments);
    if (response.statusCode != StatusCodes.Good) {
        return callback(null,response );
    }

    var methodObj = address_space.findObject(methodId);
    // invoke method on object
    var context = {
        session: session
    };

    methodObj.execute(inputArguments,context,function(err,callMethodResponse){

        if(err) { return callback(err);}

        callMethodResponse.inputArgumentResults = response.inputArgumentResults;
        assert(callMethodResponse.statusCode);

        if (callMethodResponse.statusCode === StatusCodes.Good){
            assert(_.isArray(callMethodResponse.outputArguments));
        }

        assert(_.isArray(callMethodResponse.inputArgumentResults));
        assert(callMethodResponse.inputArgumentResults.length === methodInputArguments.length);

        return callback(null,callMethodResponse);
    });

}

var maximumOperationInCallRequest = 1000;


//Table 62 – Call Service Result Codes
// Symbolic Id Description
// Bad_NothingToDo       See Table 165 for the description of this result code.
// Bad_TooManyOperations See Table 165 for the description of this result code.
//
OPCUAServer.prototype._on_CallRequest = function (message, channel) {
    var server = this;

    this._apply_on_SessionObject(RepublishResponse,message, channel, function (session) {

        var request = message.request;
        var response;
        assert(request instanceof CallRequest);

        if (request.methodsToCall.length === 0) {
            // BadNothingToDo
            response = new CallResponse({ responseHeader: {serviceResult: StatusCodes.BadNothingToDo} });
            return channel.send_response("MSG", response, message);
        }
        if (request.methodsToCall.length >= maximumOperationInCallRequest) {
            // BadTooManyOperations
            var response = new CallResponse({ responseHeader: {serviceResult: StatusCodes.BadTooManyOperations} });
            return channel.send_response("MSG", response, message);
        }

        async.map(request.methodsToCall,callMethod.bind(server,session),function(err,results){
            assert(_.isArray(results));
            response = new CallResponse({results: results});
            channel.send_response("MSG", response, message);

        },function(err){
            if(err) {
                channel.send_error_and_abort(StatusCodes.BadInternalError,err.message,"",function(){});
            }
        });
    });


};

/**
 * @method registerServer
 * @async
 * @param discovery_server_endpointUrl
 * @param callback
 */
OPCUAServer.prototype.registerServer = function (discovery_server_endpointUrl, callback) {


    var OPCUAClientBase = require("lib/client/client_base").OPCUAClientBase;

    var self = this;
    assert(self.serverType, " must have a valid server Type");

    var client = new OPCUAClientBase();

    function disconnect(callback) {
        client.disconnect(callback);
    }

    client.connect(discovery_server_endpointUrl, function (err) {
        if (!err) {

            var request = new RegisterServerRequest({
                server: {
                    serverUri: "request.serverUri",
                    productUri: "request.productUri",
                    serverNames: [
                        {locale: "en", text: "MyServerName"}
                    ],
                    serverType: self.serverType,
                    gatewayServerUri: null,
                    discoveryUrls: [],
                    semaphoreFilePath: null,
                    isOnline: false
                }
            });
            assert(request.requestHeader);
            client.performMessageTransaction(request, function (err, response) {
                // RegisterServerResponse
                assert(response instanceof RegisterServerResponse);
                disconnect(callback);
            });
        } else {
            console.log(" cannot register server to discovery server " + discovery_server_endpointUrl);
            console.log("   " + err.message);
            console.log(" make sure discovery server is up and running.");
            disconnect(callback);

        }
    });
};


exports.OPCUAServerEndPoint = OPCUAServerEndPoint;
exports.OPCUAServer = OPCUAServer;



