import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Wayland
import Quickshell.Io
import Quickshell.Services.Mpris

import "josefineLogic.js" as Logic

PanelWindow {
    id: root

    // Knytt til aktiv skjerm (velg alltid første ekte skjerm så HDMI-hotplug ikke skjuler panelet)
    screen: Quickshell.screens.length > 0 ? Quickshell.screens[0] : null

    // Lås Josefine eksklusivt til høyre side av 1520x720 skjermen
    anchors {
        top: true
        bottom: true
        right: true
    }

    implicitWidth: 390
    exclusiveZone: implicitWidth

    color: "transparent"

    // Støtt tastaturfokus når førstegangs-oppsettet vises
    WlrLayershell.keyboardFocus: root.onboardingRequired ? WlrKeyboardFocus.OnDemand : WlrKeyboardFocus.None

    // Rotkatalog for Josefine (miljøvariabel eller standard plassering)
    property string repoDir: Quickshell.env("JOSEFINE_ROOT") || (Quickshell.env("HOME") + "/code/Josefine")

    // Brukerprofil og førstegangs-oppsett
    property string userName: ""
    property bool onboardingRequired: false
    property int onboardingAge: 6
    property bool showKeyboard: false

    // Tilstandsstyring og dynamiske meldinger
    property string assistantState: "idle"
    property string dynamicStatusText: ""
    property var stateConfig: Logic.getConfigForState(assistantState)

    // ==========================================
    // MPRIS Musikk-styring & Auto-pause ved tale
    // ==========================================
    property bool musicDismissed: false
    property bool pausedForSpeech: false
    property string lastTrackTitle: ""

    property var activePlayer: {
        const list = Mpris.players.values;
        if (!list || list.length === 0) return null;
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (p && p.isPlaying) return p;
        }
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            const id = (p && p.identity ? p.identity : "").toLowerCase();
            if (p && (id.indexOf("spotify") !== -1 || p.trackTitle !== "")) return p;
        }
        return list[0];
    }

    property string currentTrackTitle: activePlayer ? activePlayer.trackTitle : ""
    onCurrentTrackTitleChanged: {
        if (currentTrackTitle !== "" && currentTrackTitle !== lastTrackTitle) {
            lastTrackTitle = currentTrackTitle;
            musicDismissed = false;
        }
    }

    property bool showMusicPlayer: activePlayer !== null
        && !musicDismissed
        && (activePlayer.isPlaying || activePlayer.playbackState === MprisPlaybackState.Paused)
        && activePlayer.trackTitle !== ""

    // Sett musikken automatisk på pause under samtale!
    onAssistantStateChanged: {
        if (assistantState === "listening" || assistantState === "speaking") {
            if (activePlayer && activePlayer.isPlaying) {
                pausedForSpeech = true;
                activePlayer.pause();
            }
        } else if (assistantState === "idle") {
            if (pausedForSpeech && activePlayer && !musicDismissed) {
                pausedForSpeech = false;
                resumeTimer.restart();
            } else {
                pausedForSpeech = false;
            }
        }
    }

    Timer {
        id: resumeTimer
        interval: 400
        repeat: false
        onTriggered: {
            if (root.assistantState === "idle" && root.activePlayer && !root.musicDismissed) {
                root.activePlayer.play();
            }
        }
    }

    // ==========================================
    // IPC: Node.js Gemini Live & Lyd-backend
    // ==========================================
    Process {
        id: backend
        command: ["node", root.repoDir + "/backend/index.js"]
        running: true

        stdout: SplitParser {
            onRead: line => {
                const trimmed = line.trim();
                if (!trimmed) return;
                try {
                    const msg = JSON.parse(trimmed);
                    if (msg.type === "state" && msg.state) {
                        root.assistantState = msg.state;
                        if (msg.state === "idle") {
                            root.dynamicStatusText = "";
                        }
                    } else if (msg.type === "status" && msg.message) {
                        root.dynamicStatusText = msg.message;
                    } else if (msg.type === "transcript" && msg.text) {
                        root.dynamicStatusText = msg.text;
                    } else if (msg.type === "profile") {
                        root.userName = msg.name || "";
                    } else if (msg.type === "onboarding_required") {
                        root.onboardingRequired = !!msg.required;
                    }
                } catch (e) {
                    // Ikke-JSON logglinjer
                }
            }
        }
    }

    // Selve Josefine-kortet: 12px radius og 12px margin overalt for perfekt konsistens
    Rectangle {
        id: card
        anchors.fill: parent
        anchors.topMargin: 12
        anchors.bottomMargin: 12
        anchors.rightMargin: 12
        anchors.leftMargin: 0
        radius: 12
        color: "#FAF9F6"
        clip: true

        ColumnLayout {
            anchors.fill: parent
            anchors.leftMargin: 24
            anchors.rightMargin: 24
            anchors.topMargin: root.showMusicPlayer ? 20 : 34
            anchors.bottomMargin: 14
            spacing: 0

            // ==========================================
            // TOPP: Musikk-kort (når musikk spiller) ELLER "JOSEFINE / Hei, <Navn>"
            // ==========================================
            JosefineMusicPlayer {
                Layout.fillWidth: true
                visible: root.showMusicPlayer && !root.onboardingRequired
                trackTitle: root.activePlayer ? root.activePlayer.trackTitle : ""
                trackArtist: root.activePlayer ? root.activePlayer.trackArtist : ""
                trackArtUrl: root.activePlayer ? root.activePlayer.trackArtUrl : ""
                isPlaying: root.activePlayer ? root.activePlayer.isPlaying : false
                canGoPrevious: root.activePlayer ? root.activePlayer.canGoPrevious : true
                canGoNext: root.activePlayer ? root.activePlayer.canGoNext : true

                onPreviousClicked: {
                    if (root.activePlayer) root.activePlayer.previous();
                }
                onTogglePlayClicked: {
                    if (root.activePlayer) {
                        root.pausedForSpeech = false;
                        root.activePlayer.togglePlaying();
                    }
                }
                onNextClicked: {
                    if (root.activePlayer) root.activePlayer.next();
                }
                onCloseClicked: {
                    root.pausedForSpeech = false;
                    root.musicDismissed = true;
                    if (root.activePlayer) root.activePlayer.pause();
                }
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 8
                visible: !root.showMusicPlayer || root.onboardingRequired

                // Kategori-etikett (JOSEFINE)
                Text {
                    text: "JOSEFINE"
                    color: "#786C95"
                    font.pixelSize: 12
                    font.weight: Font.DemiBold
                    font.letterSpacing: 2.2
                }

                // Hovedtittel
                Text {
                    text: root.userName !== "" ? ("Hei, " + root.userName) : "Hei!"
                    color: "#171719"
                    font.pixelSize: 34
                    font.weight: Font.Bold
                    Layout.topMargin: 2
                }
            }

            // Beskrivelse / statusmelding
            Text {
                Layout.fillWidth: true
                Layout.topMargin: 10
                text: root.dynamicStatusText !== "" ? root.dynamicStatusText : root.stateConfig.statusText
                color: "#6E6D74"
                font.pixelSize: 16
                wrapMode: Text.WordWrap
                lineHeight: 1.35
            }

            // ==========================================
            // FØRSTEGANGS-OPPSETT (Navn + Alder)
            // ==========================================
            Rectangle {
                Layout.fillWidth: true
                Layout.topMargin: 18
                visible: root.onboardingRequired
                radius: 16
                color: "#F2ECF9"
                border.color: "#DFD3F2"
                border.width: 1
                implicitHeight: onboardingCol.implicitHeight + 32

                ColumnLayout {
                    id: onboardingCol
                    anchors.fill: parent
                    anchors.margins: 16
                    spacing: 14

                    Text {
                        text: "Hva heter du?"
                        color: "#2C2538"
                        font.pixelSize: 15
                        font.weight: Font.DemiBold
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        height: 46
                        radius: 12
                        color: "#FFFFFF"
                        border.color: (nameInput.activeFocus || root.showKeyboard) ? "#7C65A9" : "#D8CEE8"
                        border.width: (nameInput.activeFocus || root.showKeyboard) ? 2 : 1

                        TextInput {
                            id: nameInput
                            anchors.fill: parent
                            anchors.leftMargin: 14
                            anchors.rightMargin: 14
                            verticalAlignment: TextInput.AlignVCenter
                            font.pixelSize: 18
                            color: "#171719"
                            selectByMouse: true
                            clip: true

                            onActiveFocusChanged: {
                                if (activeFocus) {
                                    root.showKeyboard = true;
                                }
                            }

                            Text {
                                anchors.fill: parent
                                verticalAlignment: Text.AlignVCenter
                                text: "Trykk her for å skrive navn..."
                                color: "#A29BB0"
                                font.pixelSize: 16
                                visible: nameInput.text.length === 0 && !nameInput.activeFocus && !root.showKeyboard
                            }

                            onAccepted: {
                                root.showKeyboard = false;
                                if (nameInput.text.trim().length > 0) {
                                    backend.write(JSON.stringify({
                                        action: "complete_onboarding",
                                        name: nameInput.text.trim(),
                                        age: root.onboardingAge
                                    }) + "\n");
                                }
                            }
                        }

                        MouseArea {
                            anchors.fill: parent
                            onClicked: {
                                nameInput.forceActiveFocus();
                                root.showKeyboard = true;
                            }
                        }
                    }

                    // Popup skjermtastatur når navneboksen er aktiv
                    JosefineKeyboard {
                        id: touchKeyboard
                        Layout.fillWidth: true
                        active: root.showKeyboard
                        textValue: nameInput.text
                        onTextValueChanged: {
                            if (nameInput.text !== textValue) {
                                nameInput.text = textValue;
                            }
                        }
                        onDoneClicked: {
                            root.showKeyboard = false;
                            nameInput.focus = false;
                        }
                    }

                    Text {
                        text: "Hvor gammel er du?"
                        color: "#2C2538"
                        font.pixelSize: 15
                        font.weight: Font.DemiBold
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 12

                        Rectangle {
                            width: 48
                            height: 44
                            radius: 12
                            color: minusArea.pressed ? "#DDD0F2" : "#FFFFFF"
                            border.color: "#D8CEE8"
                            border.width: 1

                            Text {
                                anchors.centerIn: parent
                                text: "−"
                                font.pixelSize: 24
                                font.weight: Font.Bold
                                color: "#4E3E70"
                            }

                            MouseArea {
                                id: minusArea
                                anchors.fill: parent
                                onClicked: {
                                    if (root.onboardingAge > 1) root.onboardingAge -= 1;
                                }
                            }
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            height: 44
                            radius: 12
                            color: "#FFFFFF"
                            border.color: "#D8CEE8"
                            border.width: 1

                            Text {
                                anchors.centerIn: parent
                                text: root.onboardingAge + " år"
                                font.pixelSize: 20
                                font.weight: Font.Bold
                                color: "#171719"
                            }
                        }

                        Rectangle {
                            width: 48
                            height: 44
                            radius: 12
                            color: plusArea.pressed ? "#DDD0F2" : "#FFFFFF"
                            border.color: "#D8CEE8"
                            border.width: 1

                            Text {
                                anchors.centerIn: parent
                                text: "+"
                                font.pixelSize: 24
                                font.weight: Font.Bold
                                color: "#4E3E70"
                            }

                            MouseArea {
                                id: plusArea
                                anchors.fill: parent
                                onClicked: {
                                    if (root.onboardingAge < 18) root.onboardingAge += 1;
                                }
                            }
                        }
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        Layout.topMargin: 4
                        height: 50
                        radius: 25
                        color: nameInput.text.trim().length > 0
                            ? (saveArea.pressed ? "#685296" : "#7C65A9")
                            : "#C7BCD9"

                        Text {
                            anchors.centerIn: parent
                            text: "Start Josefine"
                            color: "#FFFFFF"
                            font.pixelSize: 17
                            font.weight: Font.DemiBold
                        }

                        MouseArea {
                            id: saveArea
                            anchors.fill: parent
                            enabled: nameInput.text.trim().length > 0
                            onClicked: {
                                backend.write(JSON.stringify({
                                    action: "complete_onboarding",
                                    name: nameInput.text.trim(),
                                    age: root.onboardingAge
                                }) + "\n");
                            }
                        }
                    }
                }
            }

            // Fleksibel avstand mot bunnen – absorberer all tekstendring
            Item {
                Layout.fillWidth: true
                Layout.fillHeight: true
            }

            // ==========================================
            // BUNN: Aura & ansikt låst rett over knappen
            // ==========================================
            JosefineAura {
                id: aura
                visible: !root.onboardingRequired
                Layout.alignment: Qt.AlignHCenter
                Layout.preferredWidth: 330
                Layout.preferredHeight: 330
                Layout.bottomMargin: 6
                centerColor: root.stateConfig.auraColorCenter
                outerColor: root.stateConfig.auraColorOuter
                pulseSpeedMs: root.stateConfig.auraPulseSpeedMs
                isListening: root.stateConfig.isMicActive
                isSpeaking: root.assistantState === "speaking"
            }

            // Pilleformet mikrofonknapp & hjelpetekst
            JosefineButton {
                id: micButton
                visible: !root.onboardingRequired
                Layout.fillWidth: true
                label: root.stateConfig.buttonText
                subtext: root.stateConfig.buttonSubtext
                isListening: root.stateConfig.isMicActive

                onClicked: {
                    if (root.assistantState === "idle") {
                        backend.write(JSON.stringify({ action: "start_listening" }) + "\n");
                    } else {
                        backend.write(JSON.stringify({ action: "stop_conversation" }) + "\n");
                    }
                }
            }
        }
    }
}
