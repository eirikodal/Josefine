import QtQuick
import QtQuick.Layouts
import QtQuick.Shapes

Item {
    id: root

    property string label: "Trykk for å snakke"
    property string subtext: "Mikrofonen er av til du trykker"
    property bool isListening: false
    property string buttonColor: "#70628E"

    signal clicked()

    implicitWidth: 320
    implicitHeight: 88

    ColumnLayout {
        anchors.fill: parent
        spacing: 10

        // Hovedknapp (Pilleformet)
        Rectangle {
            id: buttonRect
            Layout.fillWidth: true
            Layout.preferredHeight: 56
            radius: height / 2
            color: mouseArea.pressed ? Qt.darker(root.buttonColor, 1.15) : (root.isListening ? "#8A699B" : root.buttonColor)

            Behavior on color {
                ColorAnimation { duration: 220 }
            }

            // Taktil trykk-tilbakemelding
            scale: mouseArea.pressed ? 0.97 : 1.0
            Behavior on scale {
                NumberAnimation { duration: 100; easing.type: Easing.OutQuad }
            }

            // Innhold: Mikrofon-ikon + tekst
            RowLayout {
                anchors.centerIn: parent
                spacing: 10

                // Vektor-tegnet mikrofon-ikon
                Item {
                    id: micIcon
                    width: 22
                    height: 22
                    Layout.alignment: Qt.AlignVCenter

                    Shape {
                        anchors.fill: parent
                        ShapePath {
                            strokeColor: "#FFFFFF"
                            strokeWidth: 2
                            fillColor: "transparent"
                            capStyle: ShapePath.RoundCap
                            joinStyle: ShapePath.RoundJoin

                            // Mikrofon-kapsel
                            PathSvg {
                                path: "M 11 3 A 3 3 0 0 1 14 6 L 14 11 A 3 3 0 0 1 8 11 L 8 6 A 3 3 0 0 1 11 3 Z"
                            }
                        }

                        // Mikrofon-bue og stativ
                        ShapePath {
                            strokeColor: "#FFFFFF"
                            strokeWidth: 2
                            fillColor: "transparent"
                            capStyle: ShapePath.RoundCap
                            joinStyle: ShapePath.RoundJoin

                            PathSvg {
                                path: "M 5 10 A 6 6 0 0 0 17 10 M 11 16 L 11 20 M 8 20 L 14 20"
                            }
                        }
                    }

                    // Liten pulsering når aktiv
                    SequentialAnimation on scale {
                        running: root.isListening
                        loops: Animation.Infinite
                        NumberAnimation { from: 1.0; to: 1.18; duration: 500; easing.type: Easing.InOutQuad }
                        NumberAnimation { from: 1.18; to: 1.0; duration: 500; easing.type: Easing.InOutQuad }
                    }
                }

                Text {
                    id: labelText
                    text: root.label
                    color: "#FFFFFF"
                    font.pixelSize: 17
                    font.weight: Font.DemiBold
                    Layout.alignment: Qt.AlignVCenter
                }
            }

            MouseArea {
                id: mouseArea
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    root.clicked();
                }
            }
        }

        // Hjelpetekst under knappen
        Text {
            id: subLabel
            Layout.fillWidth: true
            text: root.subtext
            color: "#7C7B84"
            font.pixelSize: 13
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.WordWrap
        }
    }
}
