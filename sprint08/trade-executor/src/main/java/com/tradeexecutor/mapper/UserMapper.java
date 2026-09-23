package com.tradeexecutor.mapper;

import com.tradingsystem.domain.entities.User;
import com.tradingsystem.domain.enums.UserStatus;
import org.apache.ibatis.annotations.Arg;
import org.apache.ibatis.annotations.ConstructorArgs;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.Optional;

/**
 * MyBatis mapper for User entity.
 * Provides user lookups needed by nested account mappings.
 */
@Mapper
public interface UserMapper {

    @Select("""
        SELECT user_id, first_name, last_name, email, phone, password_hash, status
        FROM users
        WHERE user_id = #{userId}
        """)
    @ConstructorArgs({
        @Arg(column = "user_id", javaType = Long.class),
        @Arg(column = "first_name", javaType = String.class),
        @Arg(column = "last_name", javaType = String.class),
        @Arg(column = "email", javaType = String.class),
        @Arg(column = "phone", javaType = String.class),
        @Arg(column = "password_hash", javaType = String.class),
        @Arg(column = "status", javaType = UserStatus.class)
    })
    Optional<User> findUserById(@Param("userId") Long userId);
}
