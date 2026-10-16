import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes

Rectangle {
    id: playerCard

    property string trackTitle: ""
    property string trackArtist: ""
    property string trackArtUrl: ""
    property bool isPlaying: false
    property bool canGoPrevious: true
    property bool canGoNext: true

    signal previousClicked()
    signal togglePlayClicked()
    signal nextClicked()
    signal closeClicked()

    radius: 16
    color: "#F2EEF9"
    border.color: "#E2DAEE"
    border.width: 1
    implicitHeight: 126

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 10

        // Øverste rad: Album-cover + Sangtittel/Artist + Lukk/Stopp-knapp (✕)
        RowLayout {
            Layout.fillWidth: true
            spacing: 12

            // Album-cover (eller vektor-tegnet musikknote)
            Rectangle {
                Layout.preferredWidth: 48
                Layout.preferredHeight: 48
                radius: 10
                color: "#E2DAF0"
                clip: true

                Image {
                    id: coverImg
                    anchors.fill: parent
                    source: playerCard.trackArtUrl
                    fillMode: Image.PreserveAspectCrop
                    visible: playerCard.trackArtUrl !== "" && status === Image.Ready
                }

                Item {
                    anchors.centerIn: parent
                    width: 24
                    height: 24
                    visible: !coverImg.visible

                    Shape {
                        anchors.fill: parent
                        ShapePath {
                            strokeColor: "#5E507A"
                            strokeWidth: 2.2
                            fillColor: "transparent"
                            capStyle: ShapePath.RoundCap
                            joinStyle: ShapePath.RoundJoin
                            PathSvg {
                                path: "M 9 18 L 9 6 L 19 4 L 19 16 M 6 18 A 3 2.5 0 1 0 9 18 A 3 2.5 0 1 0 6 18 Z M 16 16 A 3 2.5 0 1 0 19 16 A 3 2.5 0 1 0 16 16 Z"
                            }
                        }
                    }
                }
            }

            // Sangtittel og artist
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2

                Text {
                    Layout.fillWidth: true
                    text: playerCard.trackTitle !== "" ? playerCard.trackTitle : "Spiller musikk"
                    color: "#171719"
                    font.pixelSize: 16
                    font.weight: Font.Bold
                    elide: Text.ElideRight
                    maximumLineCount: 1
                }

                Text {
                    Layout.fillWidth: true
                    text: playerCard.trackArtist !== "" ? playerCard.trackArtist : "Spotify"
                    color: "#6E6D74"
                    font.pixelSize: 13
                    font.weight: Font.Medium
                    elide: Text.ElideRight
                    maximumLineCount: 1
                }
            }

            // Stopp / lukk-knapp (✕)
            Rectangle {
                Layout.preferredWidth: 30
                Layout.preferredHeight: 30
                Layout.alignment: Qt.AlignTop
                radius: 15
                color: closeMouse.pressed ? "#D5C8EC" : "#E6DFF4"

                Item {
                    anchors.centerIn: parent
                    width: 12
                    height: 12
                    Shape {
                        anchors.fill: parent
                        ShapePath {
                            strokeColor: "#5A4D74"
                            strokeWidth: 2
                            capStyle: ShapePath.RoundCap
                            PathSvg {
                                path: "M 2 2 L 10 10 M 10 2 L 2 10"
                            }
                        }
                    }
                }

                MouseArea {
                    id: closeMouse
                    anchors.fill: parent
                    onClicked: playerCard.closeClicked()
                }
            }
        }

        // Nederste rad: Store, barnevennlige spilleknapper med vektorikoner
        RowLayout {
            Layout.fillWidth: true
            spacing: 10

            // Forrige sang (|◀)
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 42
                radius: 21
                color: prevMouse.pressed ? "#D5C8EC" : "#E6DFF4"
                opacity: playerCard.canGoPrevious ? 1.0 : 0.45
                scale: prevMouse.pressed ? 0.96 : 1.0
                Behavior on scale { NumberAnimation { duration: 90 } }

                Item {
                    anchors.centerIn: parent
                    width: 20
                    height: 20
                    Shape {
                        anchors.fill: parent
                        ShapePath {
                            strokeColor: "#493D63"
                            strokeWidth: 2.2
                            fillColor: "#493D63"
                            capStyle: ShapePath.RoundCap
                            joinStyle: ShapePath.RoundJoin
                            PathSvg {
                                path: "M 5 5 L 5 15 M 15 5 L 7 10 L 15 15 Z"
                            }
                        }
                    }
                }

                MouseArea {
                    id: prevMouse
                    anchors.fill: parent
                    enabled: playerCard.canGoPrevious
                    onClicked: playerCard.previousClicked()
                }
            }

            // Spill / Pause (Hovedknapp i Josefines lillafarge #70628E)
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 42
                radius: 21
                color: playMouse.pressed ? "#5D4F79" : "#70628E"
                scale: playMouse.pressed ? 0.96 : 1.0
                Behavior on scale { NumberAnimation { duration: 90 } }

                // Pause-ikon (||) når den spiller
                Row {
                    anchors.centerIn: parent
                    spacing: 5
                    visible: playerCard.isPlaying
                    Rectangle { width: 3.5; height: 14; radius: 1.75; color: "#FFFFFF" }
                    Rectangle { width: 3.5; height: 14; radius: 1.75; color: "#FFFFFF" }
                }

                // Play-ikon (▶) når på pause
                Item {
                    anchors.centerIn: parent
                    width: 20
                    height: 20
                    visible: !playerCard.isPlaying
                    Shape {
                        anchors.fill: parent
                        ShapePath {
                            strokeColor: "#FFFFFF"
                            strokeWidth: 2
                            fillColor: "#FFFFFF"
                            joinStyle: ShapePath.RoundJoin
                            PathSvg {
                                path: "M 7 4 L 16 10 L 7 16 Z"
                            }
                        }
                    }
                }

                MouseArea {
                    id: playMouse
                    anchors.fill: parent
                    onClicked: playerCard.togglePlayClicked()
                }
            }

            // Neste sang (▶|)
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 42
                radius: 21
                color: nextMouse.pressed ? "#D5C8EC" : "#E6DFF4"
                opacity: playerCard.canGoNext ? 1.0 : 0.45
                scale: nextMouse.pressed ? 0.96 : 1.0
                Behavior on scale { NumberAnimation { duration: 90 } }

                Item {
                    anchors.centerIn: parent
                    width: 20
                    height: 20
                    Shape {
                        anchors.fill: parent
                        ShapePath {
                            strokeColor: "#493D63"
                            strokeWidth: 2.2
                            fillColor: "#493D63"
                            capStyle: ShapePath.RoundCap
                            joinStyle: ShapePath.RoundJoin
                            PathSvg {
                                path: "M 15 5 L 15 15 M 5 5 L 13 10 L 5 15 Z"
                            }
                        }
                    }
                }

                MouseArea {
                    id: nextMouse
                    anchors.fill: parent
                    enabled: playerCard.canGoNext
                    onClicked: playerCard.nextClicked()
                }
            }
        }
    }
}
