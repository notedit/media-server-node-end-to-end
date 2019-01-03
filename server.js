const express = require('express');
const expressWs = require('express-ws');
const MediaServer = require("medooze-media-server")

const SemanticSDP = require('semantic-sdp')
const SDPInfo		= SemanticSDP.SDPInfo

var expressapp = expressWs(express());
var app = expressapp.app;


const capabilities =  {
    audio : {
        codecs		: ["opus"],
        extensions	: [ "urn:ietf:params:rtp-hdrext:ssrc-audio-level", "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01"]
    },
    video : {
        codecs		: ["vp8"],
        rtcpfbs		: [
            { "id": "transport-cc"},
            { "id": "ccm", "params": ["fir"]},
            { "id": "nack"},
            { "id": "nack", "params": ["pli"]}
        ],
        extensions	: [ "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01"]
    }
}

app.get('/', function(req, res, next){
  console.log('get route', req.testing);
  res.sendFile('index.html', { root: __dirname });
});

app.ws('/channel', function(ws, req) {

    const endpoint = MediaServer.createEndpoint('127.0.0.1')
    
    ws.on('message', function(msg) {
        const data = JSON.parse(msg);

        const sdp = SDPInfo.process(data.sdp)

        const transport = endpoint.createTransport(sdp)

        transport.setRemoteProperties(sdp)

        const answer = sdp.answer({
            dtls    : transport.getLocalDTLSInfo(),
            ice		: transport.getLocalICEInfo(),
            candidates: endpoint.getLocalCandidates(),
            capabilities: capabilities
        })

        transport.setLocalProperties(answer)

        const offerStream = sdp.getFirstStream()

        console.dir(sdp.getStreams())
    
        const incomingStream = transport.createIncomingStream(offerStream)

        ws.send(JSON.stringify({
            sdp: answer.toString()
        }))


        // wait 5 second do a end to end testing
        setTimeout(()=> {

            const endpointA =  MediaServer.createEndpoint('127.0.0.1')
            const offerA = endpointA.createOffer(capabilities)

            const endpointB =  MediaServer.createEndpoint('127.0.0.1')
            const transportB = endpointB.createTransport(offerA,null, {disableSTUNKeepAlive: true})
            const answerB = offerA.answer({
                dtls    : transportB.getLocalDTLSInfo(),
                ice		: transportB.getLocalICEInfo(),
                candidates: endpointB.getLocalCandidates(),
                capabilities: capabilities
            })
            transportB.setLocalProperties(answerB)
            const outgoingStreamB = transportB.createOutgoingStream(incomingStream.getStreamInfo())
            answerB.addStream(outgoingStreamB.getStreamInfo())
            outgoingStreamB.attachTo(incomingStream)

            const transportA = endpointA.createTransport(answerB,offerA, {disableSTUNKeepAlive:true})
            transportA.setLocalProperties(offerA)
            transportA.setRemoteProperties(answerB)


            const streamInfo = answerB.getFirstStream()
            const incoming = transportA.createIncomingStream(streamInfo)
            console.dir(incoming.getStreamInfo())


        },5000)

    });
});

app.listen(3000);