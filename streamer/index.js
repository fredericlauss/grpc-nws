const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const { spawn } = require("child_process");
const { hrtime } = require("process");
const { PassThrough } = require("stream");

function getUnixTimestampNano() {
  const now = BigInt(Date.now()) * BigInt(1e6); // Convertit Date.now() en nanosecondes
  const hrTime = process.hrtime.bigint(); // Temps haute résolution en nanosecondes

  // On soustrait le temps haute résolution actuel au temps réel
  const startupTime = now - hrTime;

  // Maintenant, on peut obtenir un timestamp précis à la nanoseconde
  return startupTime + process.hrtime.bigint();
}

// Charger le fichier .proto
const PROTO_PATH = "./proto/twitchy.proto";
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {});
const twitchyProto = grpc.loadPackageDefinition(packageDefinition).twitchy;

// Créer un client gRPC
const client = new twitchyProto.Twitchy("51.38.189.96:3000", grpc.credentials.createInsecure());

// Fonction pour envoyer le flux via gRPC
function sendStream(stream, type) {
  const call = client.SendStream((error, response) => {
    if (error) {
      console.error("Erreur gRPC :", error);
    } else {
      console.log("Réponse du serveur :", response);
    }
  });

  stream.on("data", (chunk) => {
    console.log(`Envoi du flux ${type} ${timestampNs}...`);
    // Envoyer chaque chunk via gRPC
    call.write({
      ts: parseInt(getUnixTimestampNano()),
      [type]: chunk
    });
  });

  stream.on("end", () => {
    call.end();
  });
}

// Capture vidéo + audio avec child_process et FFmpeg
function captureWebcam() {
  // Flux séparés pour l'audio et la vidéo
  const videoStream = new PassThrough();  // Flux vidéo
  const audioStream = new PassThrough();  // Flux audio

  // Commande FFmpeg à exécuter dans le processus enfant
  const ffmpegProcess = spawn("ffmpeg", [
    "-f", "dshow",
    "-i", "video=Integrated Camera:audio=Réseau de microphones (Realtek(R) Audio)", // Entrée vidéo + audio
    "-vcodec", "libx264",
    "-acodec", "aac",
    "-f", "mpegts",
    "-r", "15",
    "-s", "640x480",
    "-preset", "ultrafast",
    "-tune", "zerolatency",
    "-"],
    { stdio: ["ignore", "pipe", "pipe"] } // La sortie vidéo va à stdout, la sortie audio à stderr
  );

  // Séparation des flux
  ffmpegProcess.stdout.pipe(videoStream); // Sortie vidéo
  // ffmpegProcess.stderr.pipe(audioStream); // Sortie audio

  // Envoi des flux séparés via gRPC
  sendStream(videoStream, "video");
  // sendStream(audioStream, "audio");

  ffmpegProcess.on("error", (err) => {
    console.error("Erreur processus enfant FFmpeg :", err);

  });

  ffmpegProcess.on("exit", (code) => {
    console.log(`Processus FFmpeg terminé avec le code : ${code}`);
  });
}

captureWebcam();
