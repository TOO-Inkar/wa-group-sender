package kz.wasender.whatsapp.bridge;

import kz.wasender.whatsapp.GatewayEvent;
import kz.wasender.whatsapp.GroupInfo;
import kz.wasender.whatsapp.SendException;
import kz.wasender.whatsapp.SessionState;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class BridgeWhatsAppGatewayTest {

    private final RestClient.Builder builder = RestClient.builder().baseUrl("http://bridge");
    private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    private final BridgeWhatsAppGateway gateway = new BridgeWhatsAppGateway(builder, builder);

    @Test
    void sendFailureCarriesGroupUnavailableFlag() {
        server.expect(requestTo("http://bridge/send"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().json("{\"jid\":\"1@g.us\",\"text\":\"hi\"}"))
                .andRespond(withStatus(HttpStatus.UNPROCESSABLE_ENTITY).contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":\"you're not participating in that group\",\"unavailable\":true}"));

        assertThatThrownBy(() -> gateway.sendText("1@g.us", "hi"))
                .isInstanceOfSatisfying(SendException.class, e -> {
                    assertThat(e.groupUnavailable()).isTrue();
                    assertThat(e.getMessage()).contains("not participating");
                });
        server.verify();
    }

    @Test
    void listsGroupsWithArchiveFlag() {
        server.expect(requestTo("http://bridge/groups"))
                .andRespond(withSuccess("""
                        [{"jid":"1@g.us","name":"Грузы","archived":true,"member":true,"canSend":true},
                         {"jid":"2@g.us","name":"Чат","archived":false,"member":true,"canSend":false}]
                        """, MediaType.APPLICATION_JSON));

        assertThat(gateway.listGroups()).containsExactly(
                new GroupInfo("1@g.us", "Грузы", true, true, true),
                new GroupInfo("2@g.us", "Чат", false, true, false));
    }

    @Test
    void bridgeEventsDriveSessionState() {
        var events = new ArrayList<GatewayEvent>();
        gateway.subscribe(events::add);

        gateway.handle(new BridgeWhatsAppGateway.Event(1, "qr", "2@abc", null, false, null));
        assertThat(gateway.sessionState()).isEqualTo(SessionState.WAITING_QR);
        assertThat(gateway.currentQr()).contains("2@abc");

        gateway.handle(new BridgeWhatsAppGateway.Event(2, "connected", null, null, false, null));
        gateway.handle(new BridgeWhatsAppGateway.Event(3, "disconnected", null, "socket closed", true, null));
        assertThat(gateway.sessionState()).isEqualTo(SessionState.RECONNECTING);

        gateway.handle(new BridgeWhatsAppGateway.Event(4, "removed_from_group", null, null, false, "9@g.us"));
        gateway.handle(new BridgeWhatsAppGateway.Event(5, "logged_out", null, "401", false, null));

        assertThat(events).containsExactly(
                new GatewayEvent.QrReceived("2@abc"),
                new GatewayEvent.Connected(),
                new GatewayEvent.Disconnected("socket closed", true),
                new GatewayEvent.RemovedFromGroup("9@g.us"),
                new GatewayEvent.LoggedOut());
        assertThat(gateway.sessionState()).isEqualTo(SessionState.LOGGED_OUT);
    }
}
