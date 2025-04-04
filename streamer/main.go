package main

import (
	"context"
	"fmt"
	"io"
	"log"
	"os/exec"
	"runtime"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "gitlab.com/yr72dpi/twitchy/internal/proto"
)

// type client struct {
// 	pb.UnimplementedTwitchyServer
// }

const serverAddress = "51.38.189.96:3000"

// const protoFile = "./proto/twitchy.proto"

func performTask(client pb.TwitchyClient, ns *pb.StreamValidation) {

	// Vérifier si le stream a été créé sans erreur

}

func main() {
	// Définir GOMAXPROCS pour limiter l'utilisation du CPU à 50 %
	numCPU := runtime.NumCPU()     // Obtenir le nombre total de cœurs du CPU
	runtime.GOMAXPROCS(numCPU / 2) // Utiliser seulement 50% du nombre total de cœurs

	fmt.Printf("Using %d CPUs\n", numCPU/2)

	// Connexion au serveur gRPC
	conn, err := grpc.NewClient(serverAddress, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("Erreur de connexion gRPC : %v", err)
	}
	defer conn.Close()

	client := pb.NewTwitchyClient(conn)

	globalStreaminfo := &pb.StreamInfo{
		StreamId: 1234,
		Videoquality: &pb.QualityDefinition{
			Format:     pb.Format_aac,
			Resolution: pb.Resolution_x240p,
			Fps:        pb.FPS_x5,
			Bitrate:    500000,
		},
		Audioquality: &pb.QualityDefinition{
			Format:     pb.Format_aac,
			Resolution: pb.Resolution_x240p,
			Fps:        pb.FPS_x5,
			Bitrate:    64000,
		},
	}

	// Simuler une tâche parallèle, par exemple, l'appel gRPC
	// Appeler NewStream
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()

	ns, err := client.NewStream(ctx, globalStreaminfo)
	if err != nil {
		log.Fatalf("could not create stream: %v", err)
	}

	streamId := ns.StreamId
	fmt.Printf("Stream ID : %d", streamId)

	if ns.GetError() == pb.Error_error_undefined {
		captureWebcamAndSend(client, streamId)
	}
}

// Fonction pour envoyer un flux via gRPC
func envoieStream(client pb.TwitchyClient, stream io.Reader, streamAudio io.Reader, streamId uint32) {

	// Démarrer l'appel gRPC pour envoyer le flux
	call, err := client.SendStream(context.Background())
	if err != nil {
		log.Fatalf("Erreur lors de l'appel gRPC : %v", err)
	}

	// Obtenir le timestamp actuel

	// Lire les données et envoyer par paquet via gRPC
	buf := make([]byte, 64000) // Taille de chunk
	bufA := make([]byte, 64000)
	for {
		timestampMs := time.Now().UnixNano()

		n, err := stream.Read(buf)
		if err != nil && err != io.EOF {
			log.Printf("Erreur lors de la lecture du flux video : %v", err)
			break
		}
		if n == 0 {
			break
		}
		if n > 0 {
			// fmt.Printf("Envoi du flux vidéo à %d...\n", timestampMs)
		}

		m, err := streamAudio.Read(bufA)
		if err != nil && err != io.EOF {
			log.Printf("Erreur lors de la lecture du flux audio : %v", err)
			break
		}
		if m == 0 {
			break
		}
		if m > 0 {
			// fmt.Printf("Envoi du flux audio à %d...\n", timestampMs)
		}

		// Créer le message à envoyer via gRPC
		message := &pb.StreamData{
			Ts:       uint64(timestampMs),
			StreamId: streamId,
			Video:    buf[:n],
			Audio:    bufA[:m],
		}

		// Envoyer le message via gRPC
		if err := call.Send(message); err != nil {
			log.Printf("Erreur d'envoi du message : %v", err)
			break
		}

		fmt.Printf("Ts %d...\n", timestampMs)

	}

	// Clôturer l'appel gRPC une fois le flux terminé
	if err := call.CloseSend(); err != nil {
		log.Printf("Erreur lors de la clôture du flux : %v", err)
	}

}

// Fonction pour capturer le flux vidéo et audio avec FFmpeg
func captureWebcamAndSend(client pb.TwitchyClient, streamId uint32) {
	// Commande FFmpeg pour capturer vidéo et audio
	cmd := exec.Command(
		"ffmpeg",
		"-f", "dshow",
		"-i", "video=Integrated Camera:audio=Réseau de microphones (Realtek(R) Audio)",
		// "-i", "video=screen-capture-recorder:audio=Réseau de microphones (Realtek(R) Audio)",
		// "-vf", "format=gray",
		"-vcodec", "libx264", // ou "libx264"
		"-b:v", "500k", // Réduction du débit binaire vidéo
		"-acodec", "aac",
		"-b:a", "64k", // Réduction du débit binaire audio
		"-f", "mpegts", // "avi" ou "mp4" ou "mpegts"
		"-r", "60",
		"-s", "1920x1080", // "426x240" ou "640x360" ou "854x480" ou  "1024x576" ou "1280x720"
		"-preset", "ultrafast",
		"-tune", "zerolatency",
		"-")

	/**
	 * "-preset", "ultrafast", que quand "-vcodec", "libx264"
	 */

	// Ouvrir les pipes pour récupérer la sortie vidéo et audio
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		log.Fatalf("Erreur d'ouverture du pipe de sortie vidéo : %v", err)
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		log.Fatalf("Erreur d'ouverture du pipe de sortie audio : %v", err)
	}

	// Lancer la commande FFmpeg
	if err := cmd.Start(); err != nil {
		log.Fatalf("Erreur lors du lancement de FFmpeg : %v", err)
	}

	// Séparer les flux vidéo et audio
	go envoieStream(client, stdoutPipe, stderrPipe, streamId)

	// Attendre la fin du processus FFmpeg
	if err := cmd.Wait(); err != nil {
		log.Printf("Erreur FFmpeg : %v", err)
	}

	fmt.Println("Processus FFmpeg terminé.")
}
