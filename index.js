require("dotenv").config();
const admin = require("firebase-admin");

const request = require("request");

const apiKey = process.env.YOUTUBE_API_KEY;
const channelId = process.env.CHANNEL_ID;
const webhookUrl = process.env.SLACK_HOOK_URL;

const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&allThreadsRelatedToChannelId=${channelId}&key=${apiKey}`;

admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  ),
});
const db = admin.firestore();
getYoutubeComments();

async function getYoutubeComments() {
  const latestCommentId = await getLatestComment();
  request(url, { json: true }, (err, response) => {
    if (err) {
      return console.log(err);
    }
    const commmentsForSlackMessage = [];
    console.log(response.body.items);
    response.body.items.some((item) => {
      console.log("latest comment id ", latestCommentId === item.id);
      if (item.id === latestCommentId) return true;
      let obj = new Object();
      obj.commentId = item.id;
      obj.comment = item.snippet.topLevelComment.snippet.textDisplay;
      obj.videoId = item.snippet.videoId;
      commmentsForSlackMessage.push(obj);
    });

    if (commmentsForSlackMessage.length > 0) {
      setLatestComment(commmentsForSlackMessage[0].commentId);
      sendSlackMessage(commmentsForSlackMessage);
    } else {
      console.log("no new comments");
    }
  });
}

async function setLatestComment(commentId) {
  console.log("setting latest coment id ", commentId);
  const latestCommentRef = db
    .collection("comments-store")
    .doc("latest-comment");
  const res = await latestCommentRef.update({
    commentId: commentId,
  });
}

async function getLatestComment() {
  const latestCommentRef = db
    .collection("comments-store")
    .doc("latest-comment");
  const doc = await latestCommentRef.get();
  if (!doc.exists) {
    console.log("Couldn't find document");
  } else {
    return doc.data().commentId;
  }
}

async function sendSlackMessage(unformatedMessage) {
  const formattedMessage = formatSlackMessage(unformatedMessage);
  request.post(
    {
      url: webhookUrl,
      headers: { "Content-type": "application/json" },
      json: formattedMessage,
    },
    (error, response) => {
      if (error) {
        console.error(error);
      } else if (response.statusCode !== 200) {
        console.error(
          "Error: " + response.statusCode + " " + response.statusMessage
        );
      } else {
        console.log("Message sent to Slack successfully");
      }
    }
  );
}

function formatSlackMessage(messageData) {
  messageObject = {
    text: "Youtube comment update",
    blocks: messageData.map((item) => {
      return {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Comment:* ${item.comment} \n https://www.youtube.com/watch?v=${item.videoId}`,
        },
      };
    }),
  };
  return messageObject;
}
