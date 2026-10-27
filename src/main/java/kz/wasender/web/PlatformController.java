package kz.wasender.web;

import kz.wasender.platform.Actor;
import kz.wasender.platform.AuditEntry;
import kz.wasender.platform.PlatformService;
import kz.wasender.platform.PlatformUser;
import kz.wasender.platform.TenantOverview;
import org.jspecify.annotations.Nullable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/platform")
public class PlatformController {
    private final PlatformService platform;

    public PlatformController(PlatformService platform) {
        this.platform = platform;
    }

    @GetMapping("/tenants")
    public List<TenantOverview> tenants() {
        return platform.overview();
    }

    @PostMapping("/tenants")
    public ResponseEntity<TenantOverview> create(@RequestAttribute(Actor.ATTRIBUTE) Actor actor, @RequestBody NewTenant body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(platform.create(actor, body.name(), body.login(), body.password(), body.proxy()));
    }

    @PatchMapping("/tenants/{id}")
    public TenantOverview update(@RequestAttribute(Actor.ATTRIBUTE) Actor actor, @PathVariable long id, @RequestBody TenantPatch body) {
        return platform.update(actor, id, body.change());
    }

    @PostMapping("/tenants/{id}/delete")
    public ResponseEntity<Void> delete(@RequestAttribute(Actor.ATTRIBUTE) Actor actor, @PathVariable long id, @RequestBody DeleteTenant body) {
        platform.delete(actor, id, body.confirmName());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/tenants/{id}/users")
    public List<PlatformUser> users(@PathVariable long id) {
        return platform.users(id);
    }

    @PostMapping("/tenants/{id}/users")
    public ResponseEntity<PlatformUser> createUser(@RequestAttribute(Actor.ATTRIBUTE) Actor actor, @PathVariable long id,
                                                   @RequestBody NewUser body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(platform.createUser(actor, id, body.login(), body.password()));
    }

    @PatchMapping("/users/{id}")
    public PlatformUser updateUser(@RequestAttribute(Actor.ATTRIBUTE) Actor actor, @PathVariable long id, @RequestBody UserPatch body) {
        return platform.updateUser(actor, id, body.enabled(), body.password());
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<Void> deleteUser(@RequestAttribute(Actor.ATTRIBUTE) Actor actor, @PathVariable long id) {
        platform.deleteUser(actor, id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/tenants/{id}/enter")
    public EnterLink enter(@RequestAttribute(Actor.ATTRIBUTE) Actor actor, @PathVariable long id) {
        return new EnterLink(platform.enter(actor, id));
    }

    @GetMapping("/audit")
    public List<AuditEntry> audit(@RequestParam(required = false) @Nullable Long tenantId,
                                  @RequestParam(required = false) @Nullable Integer limit) {
        return platform.audit(tenantId, limit);
    }

    public record NewTenant(@Nullable String name, @Nullable String login, @Nullable String password, @Nullable String proxy) {
    }

    public static final class TenantPatch {
        private @Nullable String name;
        private @Nullable String status;
        private @Nullable String proxy;
        private boolean proxyPresent;

        public @Nullable String getName() {
            return name;
        }

        public void setName(@Nullable String name) {
            this.name = name;
        }

        public @Nullable String getStatus() {
            return status;
        }

        public void setStatus(@Nullable String status) {
            this.status = status;
        }

        public @Nullable String getProxy() {
            return proxy;
        }

        public void setProxy(@Nullable String proxy) {
            this.proxy = proxy;
            this.proxyPresent = true;
        }

        PlatformService.TenantChange change() {
            return new PlatformService.TenantChange(name, status, proxyPresent, proxy);
        }
    }

    public record DeleteTenant(@Nullable String confirmName) {
    }

    public record NewUser(@Nullable String login, @Nullable String password) {
    }

    public record UserPatch(@Nullable Boolean enabled, @Nullable String password) {
    }

    public record EnterLink(String url) {
    }
}
